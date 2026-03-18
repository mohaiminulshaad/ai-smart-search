/**
 * scripts/check-db.js
 * Diagnostic script — shows full DB state across all tables.
 * Usage:  node scripts/check-db.js [shopDomain]
 * Example: node scripts/check-db.js my-test-store-123456789129.myshopify.com
 */

import dotenv from 'dotenv';
dotenv.config();
import pool from '../config/database.js';

const targetShop = process.argv[2] || null;
const shopParam  = targetShop ? [targetShop] : [];

const sep = (title) => console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);

async function run() {
  // ── SHOPS ──────────────────────────────────────────────────────
  sep('SHOPS');
  const shops = await pool.query(
    `SELECT id, shop_domain,
            CASE WHEN access_token IS NULL THEN '❌ NULL' ELSE '✅ SET (len=' || length(access_token) || ')' END AS token,
            scopes,
            to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created,
            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated
     FROM shops
     ${targetShop ? 'WHERE shop_domain=$1' : ''}
     ORDER BY updated_at DESC NULLS LAST`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (shops.rows.length === 0) console.log('  (no rows)');
  else console.table(shops.rows);

  // ── SMART_SEARCH SETTINGS ───────────────────────────────────────────
  // Columns: shop (PK), name, welcome_message, primary_color, bubble_position,
  //          logo_url, tone_of_voice, image_upload_enabled, active_api_key_id, updated_at
  sep('SMART_SEARCH_SETTINGS');
  const cs = await pool.query(
    `SELECT shop, name, tone_of_voice, primary_color, bubble_position,
            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated
     FROM smartSearch_settings
     ${targetShop ? 'WHERE shop=$1' : ''}
     ORDER BY updated_at DESC NULLS LAST LIMIT 10`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (cs.rows.length === 0) console.log('  (no rows)');
  else console.table(cs.rows);

  // ── DISPLAY SETTINGS ───────────────────────────────────────────
  // Columns: shop (PK), enabled, display_on, mobile_visible, updated_at
  sep('DISPLAY_SETTINGS');
  const ds = await pool.query(
    `SELECT shop, enabled, display_on, mobile_visible,
            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated
     FROM display_settings
     ${targetShop ? 'WHERE shop=$1' : ''}
     ORDER BY updated_at DESC NULLS LAST LIMIT 10`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (ds.rows.length === 0) console.log('  (no rows)');
  else console.table(ds.rows);

  // ── API KEYS ───────────────────────────────────────────────────
  // Columns: id (PK), shop, provider, label, encrypted_key, masked_key, created_at
  sep('API_KEYS');
  const ak = await pool.query(
    `SELECT id, shop, provider, label,
            masked_key,
            to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created
     FROM api_keys
     ${targetShop ? 'WHERE shop=$1' : ''}
     ORDER BY created_at DESC NULLS LAST LIMIT 10`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (ak.rows.length === 0) console.log('  (no rows)');
  else console.table(ak.rows);

  // ── KNOWLEDGE BASE ─────────────────────────────────────────────
  // Columns: id (PK), shop, type, title, url, file_path, status, uploaded_at
  sep('KNOWLEDGE_BASE');
  const kb = await pool.query(
    `SELECT id, shop, type, title, status,
            to_char(uploaded_at,'YYYY-MM-DD HH24:MI:SS') AS uploaded
     FROM knowledge_base
     ${targetShop ? 'WHERE shop=$1' : ''}
     ORDER BY uploaded_at DESC NULLS LAST LIMIT 10`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (kb.rows.length === 0) console.log('  (no rows)');
  else console.table(kb.rows);

  // ── CHAT SESSIONS ──────────────────────────────────────────────
  // Columns: id (PK), shop, customer_id, guest_name, guest_email, user_type, started_at, last_message_at
  sep('CHAT_SESSIONS');
  const sessions = await pool.query(
    `SELECT shop, user_type, COUNT(*) AS sessions,
            MAX(to_char(last_message_at,'YYYY-MM-DD HH24:MI:SS')) AS last_message
     FROM chat_sessions
     ${targetShop ? 'WHERE shop=$1' : ''}
     GROUP BY shop, user_type
     ORDER BY last_message DESC NULLS LAST`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (sessions.rows.length === 0) console.log('  (no rows)');
  else console.table(sessions.rows);

  // ── CHAT MESSAGES SUMMARY ──────────────────────────────────────
  sep('CHAT_MESSAGES (summary)');
  const msgs = await pool.query(
    `SELECT cs.shop, cm.role, COUNT(*) AS count,
            MAX(to_char(cm.created_at,'YYYY-MM-DD HH24:MI:SS')) AS latest
     FROM chat_messages cm
     JOIN chat_sessions cs ON cs.id = cm.session_id
     ${targetShop ? 'WHERE cs.shop=$1' : ''}
     GROUP BY cs.shop, cm.role
     ORDER BY latest DESC NULLS LAST`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (msgs.rows.length === 0) console.log('  (no rows)');
  else console.table(msgs.rows);

  // ── PRODUCT EMBEDDINGS (Qdrant sync) ───────────────────────────
  sep('PRODUCT_EMBEDDINGS (Qdrant sync table)');
  const pe = await pool.query(
    `SELECT shop_domain, COUNT(*) AS vectors,
            MAX(to_char(embedded_at,'YYYY-MM-DD HH24:MI:SS')) AS last_synced
     FROM product_embeddings
     ${targetShop ? 'WHERE shop_domain=$1' : ''}
     GROUP BY shop_domain
     ORDER BY last_synced DESC NULLS LAST`,
    shopParam
  ).catch(e => ({ rows: [{ error: e.message }] }));
  if (pe.rows.length === 0) console.log('  (no rows)');
  else console.table(pe.rows);

  // ── WEBHOOK REGISTRATION STATUS ────────────────────────────────
  sep('REGISTERED WEBHOOKS (live check)');
  if (targetShop) {
    const shopRow = await pool.query(
      'SELECT access_token FROM shops WHERE shop_domain=$1', [targetShop]
    ).catch(() => ({ rows: [] }));

    if (shopRow.rows[0]?.access_token) {
      const { decryptToken } = await import('../utils/crypto.js');
      const token = decryptToken(shopRow.rows[0].access_token);
      const r = await fetch(
        `https://${targetShop}/admin/api/2024-01/webhooks.json`,
        { headers: { 'X-Shopify-Access-Token': token } }
      ).catch(e => ({ ok: false, status: e.message }));

      if (r.ok) {
        const data = await r.json();
        const hooks = (data.webhooks || []).map(w => ({ id: w.id, topic: w.topic, address: w.address }));
        if (hooks.length === 0) console.log('  ⚠️  No webhooks registered!');
        else console.table(hooks);
      } else {
        console.log(`  ⚠️  Could not fetch webhooks: ${r.status}`);
      }
    } else {
      console.log('  ⚠️  No access token in DB — cannot check live webhooks');
    }
  } else {
    console.log('  (pass a shop domain as argument to check live webhooks)');
    console.log('  Example: node scripts/check-db.js my-store.myshopify.com');
  }

  console.log('\n');
  await pool.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });

