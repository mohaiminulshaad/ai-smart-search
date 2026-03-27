/**
 * config/dashboard-db.js
 * Dashboard-specific database functions.
 * All tables are created on first run via initDashboardDb().
 */
import pool from './database.js';

async function query(sql, params = []) {
  return (await pool.query(sql, params)).rows;
}
async function queryOne(sql, params = []) {
  return (await query(sql, params))[0] || null;
}

function isMissingRelationError(err) {
  return Boolean(err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')));
}

// ── Schema migration ──────────────────────────────────────────────────────────
export async function initDashboardDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Ensure shop_sessions uses shop_domain as primary identifier
      -- (already exists as 'shops' table in existing code — we add an alias view)
      -- Dashboard settings tables

      CREATE TABLE IF NOT EXISTS smartsearch_settings (
        shop TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Smart Search',
        welcome_message TEXT NOT NULL DEFAULT 'Search for any product — I will find the best matches for you!',        
        primary_color TEXT NOT NULL DEFAULT '#6366f1',
        bubble_position TEXT NOT NULL DEFAULT 'bottom-right',
        logo_url TEXT NOT NULL DEFAULT '',
        tone_of_voice TEXT NOT NULL DEFAULT 'friendly',
        image_upload_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        active_api_key_id TEXT,
        brand_name TEXT NOT NULL DEFAULT '',
        shop_description TEXT NOT NULL DEFAULT '',
        fallback_message TEXT NOT NULL DEFAULT 'I''m sorry, I couldn''t find what you''re looking for. Please try rephrasing your question or browse our store for more options.',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS display_settings (
        shop TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        display_on TEXT NOT NULL DEFAULT 'all',
        mobile_visible BOOLEAN NOT NULL DEFAULT TRUE,
        widget_type TEXT NOT NULL DEFAULT 'bubble',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        shop TEXT NOT NULL,
        provider TEXT NOT NULL,
        label TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        masked_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        shop TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'file',
        title TEXT NOT NULL,
        url TEXT,
        file_path TEXT,
        status TEXT NOT NULL DEFAULT 'processing',
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        shop TEXT NOT NULL,
        customer_id TEXT,
        guest_name TEXT,
        guest_email TEXT,
        user_type TEXT NOT NULL DEFAULT 'guest',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_shop          ON api_keys(shop);
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_shop    ON knowledge_base(shop);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_shop     ON chat_sessions(shop);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session  ON chat_messages(session_id);

      -- Safe column additions (idempotent)
      DO $ BEGIN ALTER TABLE smartsearch_settings ADD COLUMN IF NOT EXISTS active_api_key_id TEXT; END $;
      DO $ BEGIN ALTER TABLE chat_messages    ADD COLUMN IF NOT EXISTS image_url TEXT; END $;
      DO $ BEGIN ALTER TABLE display_settings ADD COLUMN IF NOT EXISTS widget_type TEXT NOT NULL DEFAULT 'bubble'; END $;

      -- Migrate legacy settings table if it exists
      DO $$
      BEGIN
        IF to_regclass('public.chatbot_settings') IS NOT NULL THEN
          INSERT INTO smartsearch_settings (
            shop, name, welcome_message, primary_color, bubble_position, logo_url,
            tone_of_voice, image_upload_enabled, active_api_key_id,
            brand_name, shop_description, fallback_message, updated_at
          )
          SELECT
            shop,
            COALESCE(name, 'Smart Search'),
            COALESCE(welcome_message, 'Search for any product — I will find the best matches for you!'),
            COALESCE(primary_color, '#6366f1'),
            COALESCE(bubble_position, 'bottom-right'),
            COALESCE(logo_url, ''),
            COALESCE(tone_of_voice, 'friendly'),
            COALESCE(image_upload_enabled, TRUE),
            active_api_key_id,
            COALESCE(brand_name, ''),
            COALESCE(shop_description, ''),
            COALESCE(fallback_message, 'I''m sorry, I couldn''t find what you''re looking for. Please try rephrasing your question or browse our store for more options.'),
            NOW()
          FROM chatbot_settings
          ON CONFLICT (shop) DO NOTHING;
        END IF;
      END $$;
    `);
    console.log('  ✅  Dashboard tables ready');
  } finally {
    client.release();
  }
}

// ── smartsearch_settings ──────────────────────────────────────────────────────────
const SMART_SEARCH_DEFAULTS = {
  name: 'Smart Search',
  welcome_message: '🔍 Search for any product — I will find the best matches for you!',
  primary_color: '#6366f1',
  bubble_position: 'bottom-right',
  logo_url: '',
  tone_of_voice: 'friendly',
  image_upload_enabled: true,
  active_api_key_id: null,
  brand_name: '',
  shop_description: '',
  fallback_message: "No matching products found. Try different keywords or browse our store for more options.",
};

function fmtSmartSearch(row) {
  return {
    name: row.name,
    welcomeMessage: row.welcome_message,
    primaryColor: row.primary_color,
    bubblePosition: row.bubble_position,
    logoUrl: row.logo_url,
    toneOfVoice: row.tone_of_voice,
    imageUploadEnabled: Boolean(row.image_upload_enabled),
    activeApiKeyId: row.active_api_key_id || null,
    brandName: row.brand_name || SMART_SEARCH_DEFAULTS.brand_name,
    shopDescription: row.shop_description || SMART_SEARCH_DEFAULTS.shop_description,
    fallbackMessage: row.fallback_message || SMART_SEARCH_DEFAULTS.fallback_message,
  };
}

export async function getSmartSearchSettings(shop) {
  try {
    const row = await queryOne('SELECT * FROM smartsearch_settings WHERE shop=$1', [shop]);
    return fmtSmartSearch(row || { ...SMART_SEARCH_DEFAULTS });
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    // Self-heal once if schema is missing in a running instance.
    await initDashboardDb();
    const row = await queryOne('SELECT * FROM smartsearch_settings WHERE shop=$1', [shop]);
    return fmtSmartSearch(row || { ...SMART_SEARCH_DEFAULTS });
  }
}

export async function saveSmartSearchSettings(shop, s) {
  let cur;
  try {
    cur = await getSmartSearchSettings(shop);
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    await initDashboardDb();
    cur = await getSmartSearchSettings(shop);
  }
  const m = {
    name: s.name ?? cur.name,
    welcome_message: s.welcomeMessage ?? cur.welcomeMessage,
    primary_color: s.primaryColor ?? cur.primaryColor,
    bubble_position: s.bubblePosition ?? cur.bubblePosition,
    logo_url: s.logoUrl ?? cur.logoUrl,
    tone_of_voice: s.toneOfVoice ?? cur.toneOfVoice,
    image_upload_enabled: s.imageUploadEnabled ?? cur.imageUploadEnabled,
    active_api_key_id: s.activeApiKeyId !== undefined ? s.activeApiKeyId : cur.activeApiKeyId,
    brand_name: s.brandName ?? cur.brandName,
    shop_description: s.shopDescription ?? cur.shopDescription,
    fallback_message: s.fallbackMessage ?? cur.fallbackMessage,
  };
  await query(
    `INSERT INTO smartsearch_settings
       (shop,name,welcome_message,primary_color,bubble_position,logo_url,tone_of_voice,image_upload_enabled,active_api_key_id,brand_name,shop_description,fallback_message,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (shop) DO UPDATE SET
         name=EXCLUDED.name, welcome_message=EXCLUDED.welcome_message,
         primary_color=EXCLUDED.primary_color, bubble_position=EXCLUDED.bubble_position,
         logo_url=EXCLUDED.logo_url, tone_of_voice=EXCLUDED.tone_of_voice,
         image_upload_enabled=EXCLUDED.image_upload_enabled,
         active_api_key_id=EXCLUDED.active_api_key_id,
         brand_name=EXCLUDED.brand_name, shop_description=EXCLUDED.shop_description,
         fallback_message=EXCLUDED.fallback_message, updated_at=NOW()`,
    [shop, m.name, m.welcome_message, m.primary_color, m.bubble_position,
     m.logo_url, m.tone_of_voice, m.image_upload_enabled, m.active_api_key_id,
     m.brand_name, m.shop_description, m.fallback_message]
  );
  return getSmartSearchSettings(shop);
}

// ── display_settings ──────────────────────────────────────────────────────────
export async function getDisplaySettings(shop) {
  const row = await queryOne('SELECT * FROM display_settings WHERE shop=$1', [shop]);
  if (!row) return { enabled: true, displayOn: 'all', mobileVisible: true, widgetType: 'bubble' };
  return {
    enabled: Boolean(row.enabled),
    displayOn: row.display_on,
    mobileVisible: Boolean(row.mobile_visible),
    widgetType: row.widget_type || 'bubble',
  };
}

export async function saveDisplaySettings(shop, s) {
  await query(
    `INSERT INTO display_settings (shop,enabled,display_on,mobile_visible,widget_type,updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (shop) DO UPDATE SET
         enabled=EXCLUDED.enabled, display_on=EXCLUDED.display_on,
         mobile_visible=EXCLUDED.mobile_visible, widget_type=EXCLUDED.widget_type, updated_at=NOW()`,
    [shop, s.enabled ?? true, s.displayOn ?? 'all', s.mobileVisible ?? true, s.widgetType ?? 'bubble']
  );
  return getDisplaySettings(shop);
}

// ── api_keys ──────────────────────────────────────────────────────────────────
export async function getApiKeys(shop) {
  const rows = await query(
    'SELECT id,provider,label,masked_key,created_at FROM api_keys WHERE shop=$1 ORDER BY created_at DESC',
    [shop]
  );
  return rows.map(r => ({
    id: r.id, provider: r.provider, label: r.label,
    maskedKey: r.masked_key, createdAt: r.created_at,
  }));
}

export async function getApiKeyValue(shop, keyId) {
  const row = await queryOne(
    'SELECT encrypted_key,provider FROM api_keys WHERE id=$1 AND shop=$2',
    [keyId, shop]
  );
  return row ? { key: row.encrypted_key, provider: row.provider } : null;
}

export async function createApiKey(shop, { provider, label, key }) {
  const masked = key.length > 8 ? key.slice(0, 4) + '****' + key.slice(-4) : '****';
  const rows = await query(
    'INSERT INTO api_keys (shop,provider,label,encrypted_key,masked_key) VALUES ($1,$2,$3,$4,$5) RETURNING id,created_at',
    [shop, provider, label, key, masked]
  );
  return { id: rows[0].id, provider, label, maskedKey: masked, createdAt: rows[0].created_at };
}

export async function deleteApiKey(shop, keyId) {
  const r = await pool.query('DELETE FROM api_keys WHERE id=$1 AND shop=$2', [keyId, shop]);
  return r.rowCount > 0;
}

// ── knowledge_base ────────────────────────────────────────────────────────────
export async function getKnowledgeBase(shop) {
  const rows = await query(
    'SELECT id,type,title,url,file_path,status,uploaded_at FROM knowledge_base WHERE shop=$1 ORDER BY uploaded_at DESC',
    [shop]
  );
  return rows.map(r => ({
    id: r.id, type: r.type, title: r.title, url: r.url,
    filePath: r.file_path, status: r.status, uploadedAt: r.uploaded_at,
  }));
}

export async function createKnowledgeRef(shop, { type = 'file', title, url = null, filePath = null }) {
  const rows = await query(
    'INSERT INTO knowledge_base (shop,type,title,url,file_path) VALUES ($1,$2,$3,$4,$5) RETURNING id,uploaded_at',
    [shop, type, title, url, filePath]
  );
  return { id: rows[0].id, type, title, url, filePath, status: 'processing', uploadedAt: rows[0].uploaded_at };
}

export async function updateKnowledgeRefStatus(id, status) {
  await query('UPDATE knowledge_base SET status=$1 WHERE id=$2', [status, id]);
}

export async function deleteKnowledgeRef(shop, docId) {
  const r = await pool.query('DELETE FROM knowledge_base WHERE id=$1 AND shop=$2', [docId, shop]);
  return r.rowCount > 0;
}

// ── chat_sessions + chat_messages ─────────────────────────────────────────────
export async function getOrCreateChatSession(shop, { sessionId, customerId = null, guestName = null, guestEmail = null }) {
  if (sessionId) {
    const existing = await queryOne(
      'SELECT * FROM chat_sessions WHERE id=$1 AND shop=$2',
      [sessionId, shop]
    );
    if (existing) {
      await query('UPDATE chat_sessions SET last_message_at=NOW() WHERE id=$1', [sessionId]);
      return {
        id: existing.id, userType: existing.user_type,
        customerId: existing.customer_id, guestName: existing.guest_name,
        guestEmail: existing.guest_email, isNew: false,
      };
    }
  }
  const userType = customerId ? 'registered' : 'guest';
  const rows = await query(
    'INSERT INTO chat_sessions (shop,customer_id,guest_name,guest_email,user_type) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [shop, customerId || null, guestName || null, guestEmail || null, userType]
  );
  return {
    id: rows[0].id, userType,
    customerId: customerId || null, guestName: guestName || null,
    guestEmail: guestEmail || null, isNew: true,
  };
}

export async function saveChatMessage(sessionId, role, content, imageUrl = null) {
  await query(
    'INSERT INTO chat_messages (session_id,role,content,image_url) VALUES ($1,$2,$3,$4)',
    [sessionId, role, content, imageUrl]
  );
}

export async function getChatHistory(sessionId, limit = 20) {
  const rows = await query(
    'SELECT role,content,image_url FROM chat_messages WHERE session_id=$1 ORDER BY created_at DESC LIMIT $2',
    [sessionId, limit]
  );
  return rows.reverse().map(r => ({ role: r.role, content: r.content, imageUrl: r.image_url }));
}

export async function getChatSessionsByShop(shop, limit = 50) {
  const rows = await query(
    `SELECT cs.*, COUNT(cm.id) as message_count
       FROM chat_sessions cs
       LEFT JOIN chat_messages cm ON cm.session_id = cs.id
       WHERE cs.shop=$1
       GROUP BY cs.id
       ORDER BY cs.last_message_at DESC LIMIT $2`,
    [shop, limit]
  );
  return rows.map(r => ({
    id: r.id, userType: r.user_type, customerId: r.customer_id,
    guestName: r.guest_name, guestEmail: r.guest_email,
    messageCount: parseInt(r.message_count), startedAt: r.started_at,
    lastMessageAt: r.last_message_at,
  }));
}

export async function getSessionMessages(sessionId, shop) {
  const session = await queryOne(
    'SELECT id FROM chat_sessions WHERE id=$1 AND shop=$2',
    [sessionId, shop]
  );
  if (!session) return null;
  const rows = await query(
    'SELECT role,content,image_url,created_at FROM chat_messages WHERE session_id=$1 ORDER BY created_at ASC',
    [sessionId]
  );
  return rows.map(r => ({
    role: r.role, content: r.content,
    imageUrl: r.image_url, createdAt: r.created_at,
  }));
}
