/**
 * routes/auth.js — Shopify OAuth Gatekeeper (Smart Search Dashboard version)
 *
 * Decision tree for GET / (called on every app open in Shopify Admin):
 *   1. No access_token in DB              → OAuth (first install / re-install)
 *   2. Scopes outdated                    → OAuth (request new permissions)
 *   3. Valid DB token + embedded + host   → verify id_token JWT → serve dashboard
 *   4. Valid DB token + no host           → redirect into Shopify Admin
 *   5. Valid DB token + host (no iframe)  → serve React dashboard
 *
 * After OAuth callback:
 *   - Saves encrypted token to `shops` table (including scopes)
 *   - Calls initDashboardDb() to ensure dashboard tables exist
 *   - Registers search widget script tag on storefront (non-blocking)
 *   - Registers webhooks (non-blocking)
 *   - Redirects to Shopify Admin → Admin calls GET /auth again with ?host=
 */

import express from 'express';
import jwt     from 'jsonwebtoken';
import pool    from '../config/database.js';
import { verifyHmac, encryptToken, generateNonce } from '../utils/crypto.js';
import { registerScriptTag }  from '../services/scriptTag.js';
import { initDashboardDb }    from '../config/dashboard-db.js';
import { ProductSyncService } from '../services/product-sync.js';

const syncService = new ProductSyncService();

const router = express.Router();

// In-memory nonce store (lost on restart — non-fatal since HMAC proves Shopify signed the request)
const nonces = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateShop(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function needsReAuth(storedScopes) {
  // Only force re-auth if we have stored scopes AND they are missing required ones.
  // Empty / null stored scopes means fresh install — don't force re-auth loop.
  if (!storedScopes || storedScopes.trim() === '') return false;
  const required = (process.env.SCOPES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const stored   = storedScopes.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return required.some(s => !stored.includes(s));
}

function buildOAuthUrl(shop) {
  const state       = generateNonce();
  const redirectUri = `${process.env.HOST}/auth/callback`;
  const scopes      = process.env.SCOPES || 'read_products,write_products,read_script_tags,write_script_tags';

  nonces.set(state, { shop, timestamp: Date.now() });

  // Clean up nonces older than 5 minutes
  for (const [key, val] of nonces.entries()) {
    if (Date.now() - val.timestamp > 300_000) nonces.delete(key);
  }

  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id',    process.env.SHOPIFY_API_KEY);
  url.searchParams.set('scope',         scopes);
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('state',         state);
  return url.toString();
}

/**
 * Send merchant to the OAuth consent page.
 *
 * - Top-level (first install): plain HTTP 302 redirect.
 *
 * - Embedded re-install (opened inside Shopify Admin iframe, no DB token):
 *     window.top.location is blocked by Shopify's CSP.
 *     The official Shopify solution is the "exit-iframe" redirect:
 *     Respond with a page that uses @shopify/app-bridge Redirect action.
 *     App Bridge intercepts navigation to *.myshopify.com/admin/oauth/authorize
 *     and promotes it to top-level automatically.
 *
 *     We use the CDN-hosted App Bridge v3 which doesn't require any bundler.
 */
function redirectToOAuth(res, shop, reason, host, isEmbedded = false) {
  console.log(`  🔐  OAuth required for ${shop} (reason: ${reason}, embedded=${isEmbedded})`);
  res.setHeader('Cache-Control', 'no-store');

  const oauthUrl = buildOAuthUrl(shop);

  if (!isEmbedded || !host) {
    // Plain top-level navigation — simple 302
    return res.redirect(oauthUrl);
  }

  // ── Embedded context (inside Shopify Admin iframe) ──────────────────────────
  // Use App Bridge Redirect action to escape the iframe at the top-level.
  // App Bridge will intercept the navigate() call and open oauthUrl in the parent window.
  const apiKey = process.env.SHOPIFY_API_KEY;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Authorizing…</title>
    <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
  </head>
  <body>
    <p style="font-family:sans-serif;padding:20px;color:#666">Authorizing with Shopify…</p>
    <script>
      var AppBridge = window['app-bridge'];
      var createApp = AppBridge.default;
      var Redirect  = AppBridge.actions.Redirect;

      var app = createApp({
        apiKey: ${JSON.stringify(apiKey)},
        host:   ${JSON.stringify(host)},
      });

      Redirect.create(app).dispatch(
        Redirect.Action.REMOTE,
        ${JSON.stringify(oauthUrl)}
      );
    </script>
  </body>
</html>`);
}

// ── GET /auth ─────────────────────────────────────────────────────────────────
// Shopify calls this on every app open (install, re-open, scope change).
router.get('/', async (req, res) => {
  const { shop, host, embedded, id_token } = req.query;

  if (!shop || !validateShop(shop)) {
    return res.status(400).send(`
      <h2 style="font-family:sans-serif">Invalid or missing shop parameter</h2>
      <p>This app must be opened from the Shopify Admin.</p>`);
  }

  const isEmbedded = embedded === '1' || !!host;

  try {
    const { rows } = await pool.query(
      'SELECT access_token, scopes FROM shops WHERE shop_domain=$1',
      [shop]
    );
    const row = rows[0];
    const hasToken = !!(row?.access_token);

    console.log(`  ℹ️   Auth check — shop=${shop} hasToken=${hasToken} embedded=${isEmbedded} id_token=${!!id_token}`);

    // ── Step 1: No access token in DB → MUST do full OAuth ───────────────────
    // This covers: first install, re-install after uninstall, token wiped by webhook
    if (!hasToken) {
      return redirectToOAuth(res, shop, 'no access token in DB', host, isEmbedded);
    }

    // ── Step 2: Scopes changed → re-auth ─────────────────────────────────────
    if (needsReAuth(row.scopes)) {
      return redirectToOAuth(res, shop, 'scopes outdated', host, isEmbedded);
    }

    // ── Step 3: Has valid DB token — handle how to open the dashboard ─────────

    // No host param = not opened from Shopify Admin — redirect there so Shopify
    // calls us back with ?host= which is required for App Bridge.
    if (!host) {
      console.log(`  ↩️   No host param — redirecting ${shop} to Admin`);
      return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`);
    }

    // Embedded re-open: Shopify sends id_token JWT — verify it to confirm identity
    if (embedded === '1' && id_token) {
      try {
       const decoded = jwt.verify(id_token, process.env.SHOPIFY_API_SECRET, {
          algorithms: ['HS256'],
          clockTolerance: 30,   // seconds
        });
        const tokenShop = (decoded.dest || '').replace('https://', '');

        if (tokenShop !== shop) {
          console.warn(`  ⚠️   id_token dest mismatch: ${tokenShop} vs ${shop}`);
          return redirectToOAuth(res, shop, 'id_token shop mismatch', host, true);
        }

        console.log(`  ✅  Auth OK (id_token verified + DB token present) for ${shop}`);
        return res.redirect(`/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);

      } catch (jwtErr) {
        console.warn(`  ⚠️   id_token verification failed for ${shop}: ${jwtErr.message}`);
        return redirectToOAuth(res, shop, 'id_token invalid', host, true);
      }
    }

    // Non-embedded open with host (e.g. direct link) — has token, serve dashboard
    console.log(`  ✅  Auth OK for ${shop} — serving dashboard`);
    return res.redirect(`/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);

  } catch (err) {
    console.error(`  ❌  Auth DB error for ${shop}:`, err.message);
    return redirectToOAuth(res, shop, `DB error: ${err.message}`, host, isEmbedded);
  }
});

// ── GET /auth/callback ────────────────────────────────────────────────────────
// Shopify redirects here after the merchant approves the OAuth consent.
router.get('/callback', async (req, res) => {
  const { shop, code, hmac, state, error } = req.query;

  if (error) {
    console.warn(`  ⚠️   OAuth denied by merchant for ${shop}: ${error}`);
    return res.status(403).send(`
      <h2 style="font-family:sans-serif">Authorization Cancelled</h2>
      <p>You cancelled the installation. Please try again from the Shopify Admin → Apps.</p>`);
  }

  if (!shop || !code || !hmac) {
    return res.status(400).send(`
      <h2 style="font-family:sans-serif">Missing OAuth parameters</h2>
      <p>This URL should only be called by Shopify during the OAuth flow.</p>`);
  }

  if (!validateShop(shop)) {
    return res.status(400).send(`<h2 style="font-family:sans-serif">Invalid shop domain</h2>`);
  }

  // ── HMAC verification (proves request came from Shopify) ─────────────────
  if (!verifyHmac(req.query)) {
    console.error(`  ❌  HMAC verification failed for ${shop}`);
    return res.status(400).send(`
      <h2 style="font-family:sans-serif">HMAC verification failed</h2>
      <p>This request may have been tampered with.</p>`);
  }

  // ── State / nonce check (CSRF protection) — non-fatal ──────────────────────
  // Nonces are stored in memory and wiped on server restart, so we only warn.
  // HMAC above already proves Shopify issued this request.
  if (state) {
    if (nonces.has(state)) {
      const nonceData = nonces.get(state);
      nonces.delete(state);
      if (nonceData.shop !== shop) {
        console.warn(`  ⚠️   Nonce shop mismatch: expected ${nonceData.shop}, got ${shop}`);
      }
    } else {
      console.warn(`  ⚠️   Nonce ${state} not found (server may have restarted) — proceeding (HMAC is valid)`);
    }
  }

  try {
    console.log(`  🔄  Exchanging OAuth code for access token — shop=${shop}`);

    // ── Token exchange ────────────────────────────────────────────────────────
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        client_id:     process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange HTTP ${tokenRes.status}: ${text}`);
    }

    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('Shopify returned no access_token');

    console.log(`  🔑  Token received for ${shop} — saving to DB`);

    // ── Persist encrypted token + scopes ─────────────────────────────────────
    const encryptedToken = encryptToken(access_token);
    const scopes         = process.env.SCOPES || '';

    await pool.query(
      `INSERT INTO shops (shop_domain, access_token, scopes, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (shop_domain)
       DO UPDATE SET access_token = $2, scopes = $3, updated_at = NOW()`,
      [shop, encryptedToken, scopes]
    );

    console.log(`  ✅  OAuth complete — token & scopes saved for ${shop}`);

    // ── Post-install tasks (non-blocking) ────────────────────────────────────
    // Ensure all dashboard DB tables exist
    initDashboardDb()
      .then(() => console.log(`  🗄️   Dashboard DB tables verified`))
      .catch(e  => console.warn(`  ⚠️   Dashboard DB init warning:`, e.message));

    // Register search widget script tag on the storefront
    registerScriptTag(shop, access_token)
      .catch(e => console.warn(`  ⚠️   ScriptTag registration failed for ${shop}:`, e.message));

    // Register all required webhooks
    registerWebhooks(shop, access_token)
      .catch(e => console.warn(`  ⚠️   Webhook registration warning for ${shop}:`, e.message));

    // Kick off initial product sync into Qdrant (non-blocking)
    console.log(`  🔄  Triggering initial product sync for ${shop}…`);
    syncService.syncShop(shop, { fullRebuild: true })
      .then(r => console.log(`  ✅  Initial sync done for ${shop}: ${r?.productsProcessed ?? 0} products, ${r?.vectorsCreated ?? 0} vectors`))
      .catch(e => console.warn(`  ⚠️   Initial product sync failed for ${shop}:`, e.message));

    // ── Redirect into Shopify Admin ───────────────────────────────────────────
    // Admin will call GET /auth again with ?embedded=1&host=... — this time the
    // DB token exists so we skip OAuth and serve the dashboard directly.
    const adminUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    console.log(`  ↪️   OAuth done — redirecting to ${adminUrl}`);
    return res.redirect(adminUrl);

  } catch (err) {
    console.error(`  ❌  OAuth callback error for ${shop}:`, err.message);
    return res.status(502).send(`
      <h2 style="font-family:sans-serif">Authentication Failed</h2>
      <p>${err.message}</p>
      <p><a href="https://${shop}/admin/apps">Return to Shopify Apps</a></p>`);
  }
});

// ── Webhook registration helper ───────────────────────────────────────────────
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'app/uninstalled',  address: `${process.env.HOST}/webhooks/app-uninstalled` },
    { topic: 'products/create',  address: `${process.env.HOST}/webhooks/products-create` },
    { topic: 'products/update',  address: `${process.env.HOST}/webhooks/products-update` },
    { topic: 'products/delete',  address: `${process.env.HOST}/webhooks/products-delete` },
  ];

  for (const wh of webhooks) {
    try {
      const r = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
        method:  'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type':          'application/json',
        },
        body: JSON.stringify({
          webhook: { topic: wh.topic, address: wh.address, format: 'json' },
        }),
      });

      if (r.ok) {
        const data = await r.json();
        console.log(`  ✅  Webhook registered: ${wh.topic} (ID: ${data.webhook?.id})`);
      } else {
        const text = await r.text();
        // 422 = already registered — not an error
        if (r.status === 422) {
          console.log(`  ℹ️   Webhook already registered: ${wh.topic}`);
        } else {
          console.warn(`  ⚠️   Webhook ${wh.topic} failed (${r.status}): ${text.slice(0, 200)}`);
        }
      }
    } catch (e) {
      console.warn(`  ⚠️   Webhook ${wh.topic} error:`, e.message);
    }
  }
}

// ── DELETE /auth/uninstall — test helper ──────────────────────────────────────
router.delete('/uninstall', async (req, res) => {
  const { shop } = req.query;
  if (!shop || !validateShop(shop)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }
  try {
    await pool.query('DELETE FROM shops WHERE shop_domain=$1', [shop]);
    res.json({ success: true, message: `Shop ${shop} removed from DB.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete shop' });
  }
});

export default router;
