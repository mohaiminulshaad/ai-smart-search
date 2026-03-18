/**
 * services/scriptTag.js
 * Manages the Shopify ScriptTag that injects the smart search widget into the storefront.
 *
 * After OAuth, registerScriptTag() is called → Shopify injects
 * <script src="APP_URL/smartSearch.js"> on every storefront page automatically.
 */
import dotenv from 'dotenv';
dotenv.config();

const API_VERSION = '2024-01';

function adminUrl(shop, path) {
  return `https://${shop}/admin/api/${API_VERSION}/${path}`;
}

function headers(token) {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  };
}

function scriptSrc() {
  return `${process.env.HOST}/smart-search-widget.js`;
}

export async function listScriptTags(shop, token) {
  const res = await fetch(adminUrl(shop, 'script_tags.json'), { headers: headers(token) });
  if (!res.ok) throw new Error(`Failed to list script tags: ${res.status}`);
  const data = await res.json();
  return data.script_tags || [];
}

export async function registerScriptTag(shop, token) {
  const src = scriptSrc();

  // ScriptTag API requires a publicly accessible HTTPS URL.
  if (src.includes('localhost') || src.startsWith('http://')) {
    console.warn(`  ⚠️   Script tag skipped — APP_URL must be public HTTPS (got: ${src})`);
    return;
  }

  const existing = await listScriptTags(shop, token);

  // Remove any stale smart-search-widget.js tags that point to old URLs (e.g. expired ngrok tunnels)
  const stale = existing.filter(t => t.src.endsWith('/smart-search-widget.js') && t.src !== src);
  for (const tag of stale) {
    const del = await fetch(adminUrl(shop, `script_tags/${tag.id}.json`), {
      method: 'DELETE',
      headers: headers(token),
    });
    if (del.ok || del.status === 404) {
      console.log(`  🗑️   Removed stale script tag for ${shop} — id: ${tag.id} (was: ${tag.src})`);
    }
  }

  if (existing.some(t => t.src === src)) {
    console.log(`  ✅  Script tag already registered for ${shop}`);
    return;
  }

  const res = await fetch(adminUrl(shop, 'script_tags.json'), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      script_tag: {
        event: 'onload',
        src,
        display_scope: 'online_store',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to register script tag: ${text}`);
  }

  const data = await res.json();
  console.log(`  ✅  Script tag registered for ${shop} — id: ${data.script_tag?.id}`);
  return data.script_tag;
}

export async function removeScriptTag(shop, token) {
  const existing = await listScriptTags(shop, token);
  // Remove ALL smart-search-widget.js tags (not just current URL) for clean uninstall
  const ours = existing.filter(t => t.src.endsWith('/smart-search-widget.js'));

  for (const tag of ours) {
    const res = await fetch(adminUrl(shop, `script_tags/${tag.id}.json`), {
      method: 'DELETE',
      headers: headers(token),
    });
    if (res.ok || res.status === 404) {
      console.log(`  🗑️   Script tag removed for ${shop} — id: ${tag.id}`);
    }
  }
}
