/**
 * routes/dashboard.js
 * All merchant dashboard API endpoints for Smart Search.
 *
 * Public:
 *   GET  /api/health
 *   GET  /api/widget/settings?shop=   — storefront widget
 *   POST /api/chat                    — storefront search
 *
 * Protected (requires Shopify App Bridge JWT):
 *   GET  /api/dashboard/stats
 *   GET/POST /api/smart-search/settings
 *   POST /api/smart-search/logo            — multipart
 *   GET/POST /api/display-settings
 *   GET/POST/DELETE /api/knowledge-base
 *   POST /api/knowledge-base/upload   — multipart
 *   GET/POST/DELETE /api/api-keys
 *   GET  /api/users/guests
 *   GET  /api/users/registered
 *   GET  /api/users/sessions/:id/messages
 */

import { Router } from 'express';
import multer from 'multer';
import { verifySessionToken, extractShop } from '../middleware/session.js';
import {
  getSmartSearchSettings, saveSmartSearchSettings,
  getDisplaySettings, saveDisplaySettings,
  getApiKeys, getApiKeyValue, createApiKey, deleteApiKey,
  getKnowledgeBase, createKnowledgeRef, updateKnowledgeRefStatus, deleteKnowledgeRef,
  getOrCreateChatSession, saveChatMessage, getChatHistory,
  getChatSessionsByShop, getSessionMessages,
} from '../config/dashboard-db.js';
import { registerScriptTag, removeScriptTag } from '../services/scriptTag.js';
import { uploadToShopifyCDN } from '../services/shopifyFiles.js';
import { generateAIResponse } from '../services/aiChat.js';
import pool from '../config/database.js';

const router = Router();

// multer — in-memory storage (files sent straight to Shopify CDN)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// ── Helper: get shop access token ─────────────────────────────────────────────
async function getShopToken(shop) {
  const row = await pool.query(
    'SELECT access_token FROM shops WHERE shop_domain=$1',
    [shop]
  );
  const r = row.rows[0];
  if (!r) { const e = new Error(`${shop} not authenticated`); e.status = 401; throw e; }
  // Decrypt if using encryption (from existing auth.js)
  if (typeof r.access_token === 'string' && r.access_token.length > 32) {
    try {
      const { default: Cryptr } = await import('cryptr');
      const cryptr = new Cryptr(process.env.ENCRYPTION_KEY);
      return cryptr.decrypt(r.access_token);
    } catch {
      return r.access_token; // fallback: token not encrypted
    }
  }
  return r.access_token;
}

// ── Public: widget settings ───────────────────────────────────────────────────
router.get('/widget/settings', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ detail: 'shop param required' });
  try {
    const [smartSearch, display] = await Promise.all([
      getSmartSearchSettings(shop),
      getDisplaySettings(shop),
    ]);
    res.json({ smartSearch, display, shop });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ── Public: storefront chat ───────────────────────────────────────────────────
router.post('/chat/widget', upload.single('image'), async (req, res) => {
  try {
    const { shop, message, session_id, customer_id, guest_name, guest_email } = req.body;
    if (!shop)    return res.status(400).json({ detail: 'shop is required' });
    if (!message) return res.status(400).json({ detail: 'message is required' });

    // Validate shop is installed
    const shopCheck = await pool.query(
      'SELECT shop_domain FROM shops WHERE shop_domain=$1',
      [shop]
    );
    if (!shopCheck.rows.length) {
      return res.status(403).json({ detail: 'App not installed on this store' });
    }

    const session = await getOrCreateChatSession(shop, {
      sessionId: session_id || null,
      customerId: customer_id || null,
      guestName: guest_name || null,
      guestEmail: guest_email || null,
    });

    // Handle image — accept from all users, pass buffer directly to AI (no CDN upload needed)
    let imageUrl = null;
    let imageBuffer = null;
    let imageMimeType = null;
    if (req.file) {
      imageBuffer   = req.file.buffer;
      imageMimeType = req.file.mimetype;
      // Still try CDN upload for registered users so the image_url is returned in the response
      if (session.userType === 'registered') {
        try {
          const token = await getShopToken(shop);
          const uploaded = await uploadToShopifyCDN(
            shop, token,
            req.file.buffer, req.file.originalname, req.file.mimetype
          );
          imageUrl = uploaded.url;
        } catch (e) {
          console.warn('  ⚠️   CDN upload failed (will use buffer directly):', e.message);
        }
      }
    }

    const history = await getChatHistory(session.id, 20);
    await saveChatMessage(session.id, 'user', message, imageUrl);

    // Get AI key for this shop
    const smartSearchSettings = await getSmartSearchSettings(shop);
    let apiKeyData = null;
    if (smartSearchSettings.activeApiKeyId) {
      apiKeyData = await getApiKeyValue(shop, smartSearchSettings.activeApiKeyId);
    }

    // If image was uploaded, use the shop's AI key to describe it,
    // then search for similar products in the store's vector DB.
    let productContext = null;
    let matchedProducts = [];
    if (req.file && apiKeyData) {
      try {
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageMimeType || 'image/jpeg';
        let imageDescription = '';

        if (apiKeyData.provider === 'gemini') {
          // Step 1a: Gemini vision — describe the image
          const descRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeyData.key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  role: 'user',
                  parts: [
                    { inlineData: { mimeType, data: base64 } },
                    { text: 'Describe this image in short product-search keywords (e.g. color, type, material, style). Also extract any visible text, brand names, or product names from the image. Output only the keywords and extracted text, no sentences.' },
                  ],
                }],
                generationConfig: { maxOutputTokens: 100, temperature: 0.2 },
              }),
            }
          );
          if (descRes.ok) {
            const descData = await descRes.json();
            imageDescription = descData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          }
        } else if (apiKeyData.provider === 'chatgpt') {
          // Step 1b: OpenAI vision — describe the image
          const dataUri = `data:${mimeType};base64,${base64}`;
          const descRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKeyData.key}` },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: dataUri } },
                  { type: 'text', text: 'Describe this image in short product-search keywords (e.g. color, type, material, style). Also extract any visible text, brand names, or product names from the image. Output only the keywords and extracted text, no sentences.' },
                ],
              }],
              max_tokens: 100,
              temperature: 0.2,
            }),
          });
          if (descRes.ok) {
            const descData = await descRes.json();
            imageDescription = descData.choices?.[0]?.message?.content || '';
          }
        }

        if (imageDescription) {
          console.log(`  🔍  Image described as: ${imageDescription}`);
          // Step 2: Search store products using the image description
          const { VectorStoreService } = await import('../services/vector-store.js');
          const vs = new VectorStoreService();
          const searchQuery = `${imageDescription} ${message}`.trim();
          matchedProducts = await vs.search(shop, searchQuery, { limit: 5 });

          if (matchedProducts.length > 0) {
            productContext = matchedProducts.map((p, i) =>
              `Product ${i + 1}:\n- Name: ${p.title}\n- Price: $${p.price_min}${p.price_max !== p.price_min ? ` - $${p.price_max}` : ''}\n- Brand: ${p.vendor || 'N/A'}\n- Type: ${p.product_type || 'N/A'}\n- Available: ${p.available ? 'Yes' : 'No'}`
            ).join('\n\n');
          }
        }
      } catch (e) {
        console.warn('  ⚠️   Image→product search failed:', e.message);
      }
    }

    const reply = await generateAIResponse({
      message,
      userType: session.userType,
      history,
      imageUrl,
      imageBuffer,
      imageMimeType,
      apiKeyData,
      smartSearchName: smartSearchSettings.name,
      toneOfVoice: smartSearchSettings.toneOfVoice,
      productContext,
      brandName: smartSearchSettings.brandName,
      shopDescription: smartSearchSettings.shopDescription,
    });

    await saveChatMessage(session.id, 'assistant', reply);

    const responsePayload = {
      reply,
      session_id: session.id,
      user_type: session.userType,
      image_url: imageUrl,
    };

    // Include matched product cards so the widget can display them
    if (matchedProducts.length > 0) {
      responsePayload.products = matchedProducts.slice(0, 3).map(p => ({
        id: p.product_id,
        title: p.title,
        price: p.price_min,
        image: p.image_url,
        available: p.available,
        handle: p.handle || '',
      }));

      // Include similar products from the same collection
      const topCollection = matchedProducts[0].collection_titles?.[0];
      if (topCollection) {
        const { VectorStoreService } = await import('../services/vector-store.js');
        const vs = new VectorStoreService();
        const primaryIds = matchedProducts.slice(0, 3).map(p => p.product_id);
        const searchQuery = `${message}`.trim();
        const similar = await vs.searchSimilar(shop, searchQuery, topCollection, primaryIds, 4);
        if (similar.length > 0) {
          responsePayload.similar_products = similar.map(p => ({
            id: p.product_id,
            title: p.title,
            price: p.price_min,
            image: p.image_url,
            available: p.available,
            handle: p.handle || '',
          }));
          responsePayload.similar_collection = topCollection;
        }
      }
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('  ❌  Widget chat error:', err.message);
    res.status(500).json({ detail: err.message });
  }
});

// ── Protected: dashboard stats ────────────────────────────────────────────────
router.get('/dashboard/stats', verifySessionToken, async (req, res) => {
  try {
    const shop = extractShop(req);
    const [sessions, kb, productRow] = await Promise.all([
      getChatSessionsByShop(shop, 1000),
      getKnowledgeBase(shop),
      pool.query(
        'SELECT COUNT(*) AS cnt FROM product_embeddings WHERE shop_domain=$1',
        [shop]
      ),
    ]);

    // Searches today: sessions started since midnight local time
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySessions = sessions.filter(s => new Date(s.startedAt) >= today);

    res.json({
      total_conversations:    sessions.length,
      searches_today:         todaySessions.length,
      guest_users:            sessions.filter(s => s.userType === 'guest').length,
      registered_users:       sessions.filter(s => s.userType === 'registered').length,
      knowledge_base_items:   kb.length,
      products_indexed:       parseInt(productRow.rows[0]?.cnt ?? '0', 10),
    });
  } catch {
    res.json({
      total_conversations: 0, searches_today: 0,
      guest_users: 0, registered_users: 0,
      knowledge_base_items: 0, products_indexed: 0,
    });
  }
});

// ── Protected: smart search settings ───────────────────────────────────────────────
router.get('/smart-search/settings', verifySessionToken, async (req, res) => {
  try {
    const shop = extractShop(req);
    console.log('[GET /smart-search/settings] shop:', shop);
    const settings = await getSmartSearchSettings(shop);
    console.log('[GET /smart-search/settings] settings:', settings);
    res.json(settings);
  } catch (err) { 
    console.error('[GET /smart-search/settings] Error:', err);
    res.status(500).json({ detail: err.message }); 
  }
});

router.post('/smart-search/settings', verifySessionToken, async (req, res) => {
  try {
    const shop = extractShop(req);
    console.log('[POST /smart-search/settings] shop:', shop);
    console.log('[POST /smart-search/settings] body:', req.body);
    const saved = await saveSmartSearchSettings(shop, req.body);
    console.log('[POST /smart-search/settings] saved:', saved);
    res.json(saved);
  } catch (err) { 
    console.error('[POST /smart-search/settings] Error:', err);
    res.status(500).json({ detail: err.message }); 
  }
});

// Logo upload → Shopify CDN
router.post('/smart-search/logo', verifySessionToken, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: 'No file uploaded' });
    const shop  = extractShop(req);
    const token = await getShopToken(shop);
    const file  = await uploadToShopifyCDN(
      shop, token,
      req.file.buffer, req.file.originalname, req.file.mimetype
    );
    if (!file.url) throw new Error('Shopify did not return a CDN URL for the logo');
    res.json({ url: file.url, id: file.id });
  } catch (err) {
    console.error('  ❌  Logo upload error:', err.message);
    res.status(500).json({ detail: err.message });
  }
});

// ── Protected: display settings ───────────────────────────────────────────────
router.get('/display-settings', verifySessionToken, async (req, res) => {
  try {
    res.json(await getDisplaySettings(extractShop(req)));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.post('/display-settings', verifySessionToken, async (req, res) => {
  try {
    const shop  = extractShop(req);
    const saved = await saveDisplaySettings(shop, req.body);
    // Enable/disable script tag based on display settings
    try {
      const token = await getShopToken(shop);
      if (saved.enabled) {
        registerScriptTag(shop, token).catch(e =>
          console.warn('ScriptTag register failed:', e.message));
      } else {
        removeScriptTag(shop, token).catch(e =>
          console.warn('ScriptTag remove failed:', e.message));
      }
    } catch {
      // Non-fatal: script tag sync is best-effort
    }
    res.json(saved);
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

// ── Protected: knowledge base ─────────────────────────────────────────────────
router.get('/knowledge-base', verifySessionToken, async (req, res) => {
  try {
    res.json(await getKnowledgeBase(extractShop(req)));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.post('/knowledge-base/upload', verifySessionToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: 'No file uploaded' });

    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      return res.status(400).json({ detail: 'Only Excel files (.xlsx) are supported. Please upload a file with Question and Answer columns.' });
    }

    // Parse Excel
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ detail: 'Excel file has no sheets' });

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ detail: 'Excel file is empty' });

    // Find Question and Answer columns (case-insensitive)
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    const qCol = keys.find(k => /^question$/i.test(k.trim()));
    const aCol = keys.find(k => /^answer$/i.test(k.trim()));

    if (!qCol || !aCol) {
      return res.status(400).json({
        detail: `Excel must have "Question" and "Answer" columns. Found columns: ${keys.join(', ')}`,
      });
    }

    // Extract Q&A pairs, skip empty rows
    const qaPairs = rows
      .map(r => ({ question: String(r[qCol] || '').trim(), answer: String(r[aCol] || '').trim() }))
      .filter(qa => qa.question && qa.answer);

    if (!qaPairs.length) {
      return res.status(400).json({ detail: 'No valid Q&A pairs found. Ensure Question and Answer columns are not empty.' });
    }

    const shop  = extractShop(req);
    const token = await getShopToken(shop);

    // Upload original file to Shopify CDN
    let fileUrl = null;
    try {
      const cdnFile = await uploadToShopifyCDN(
        shop, token,
        req.file.buffer, originalName, req.file.mimetype
      );
      fileUrl = cdnFile.url;
    } catch (e) {
      console.warn('  ⚠️   Shopify CDN upload failed, storing without URL:', e.message);
    }

    // Create DB record
    const doc = await createKnowledgeRef(shop, {
      type:  'file',
      title: originalName,
      url:   fileUrl,
    });

    // Embed Q&A pairs into Qdrant
    try {
      const { VectorStoreService } = await import('../services/vector-store.js');
      const vs = new VectorStoreService();
      const count = await vs.upsertKBEntries(shop, doc.id, qaPairs);
      await updateKnowledgeRefStatus(doc.id, 'ready');
      console.log(`  ✅  KB: ${count} Q&A pairs embedded for ${originalName}`);
      res.json({ ...doc, url: fileUrl, status: 'ready', qaCount: count });
    } catch (embedErr) {
      console.error('  ❌  KB embedding error:', embedErr.message);
      await updateKnowledgeRefStatus(doc.id, 'error');
      res.json({ ...doc, url: fileUrl, status: 'error', error: 'File uploaded but embedding failed. Check API key.' });
    }
  } catch (err) {
    console.error('  ❌  KB upload error:', err.message);
    res.status(500).json({ detail: err.message });
  }
});

router.post('/knowledge-base/reference', verifySessionToken, async (req, res) => {
  try {
    const { type = 'url', title, url, filePath } = req.body;
    if (!title) return res.status(400).json({ detail: 'title is required' });
    res.json(await createKnowledgeRef(extractShop(req), { type, title, url, filePath }));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.delete('/knowledge-base/:docId', verifySessionToken, async (req, res) => {
  try {
    const shop = extractShop(req);
    const docId = req.params.docId;

    // Delete from Qdrant first
    try {
      const { VectorStoreService } = await import('../services/vector-store.js');
      const vs = new VectorStoreService();
      await vs.deleteKBByDocId(shop, docId);
    } catch (e) {
      console.warn('[KB] Qdrant delete failed (non-fatal):', e.message);
    }

    const ok = await deleteKnowledgeRef(shop, docId);
    if (!ok) return res.status(404).json({ detail: 'Document not found' });
    res.json({ deleted: docId });
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

// ── Protected: API keys ───────────────────────────────────────────────────────
router.get('/api-keys', verifySessionToken, async (req, res) => {
  try {
    res.json(await getApiKeys(extractShop(req)));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.post('/api-keys', verifySessionToken, async (req, res) => {
  try {
    const { provider, label, key } = req.body;
    if (!provider || !label || !key)
      return res.status(400).json({ detail: 'provider, label, and key are required' });
    if (!['gemini', 'chatgpt'].includes(provider))
      return res.status(400).json({ detail: 'provider must be gemini or chatgpt' });
    res.json(await createApiKey(extractShop(req), { provider, label, key }));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.delete('/api-keys/:keyId', verifySessionToken, async (req, res) => {
  try {
    const ok = await deleteApiKey(extractShop(req), req.params.keyId);
    if (!ok) return res.status(404).json({ detail: 'API key not found' });
    res.json({ deleted: req.params.keyId });
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

// ── Protected: users / chat sessions ─────────────────────────────────────────
router.get('/users/guests', verifySessionToken, async (req, res) => {
  try {
    const sessions = await getChatSessionsByShop(extractShop(req));
    res.json(sessions.filter(s => s.userType === 'guest'));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.get('/users/registered', verifySessionToken, async (req, res) => {
  try {
    const sessions = await getChatSessionsByShop(extractShop(req));
    res.json(sessions.filter(s => s.userType === 'registered'));
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

router.get('/users/sessions/:sessionId/messages', verifySessionToken, async (req, res) => {
  try {
    const msgs = await getSessionMessages(req.params.sessionId, extractShop(req));
    if (msgs === null) return res.status(404).json({ detail: 'Session not found' });
    res.json(msgs);
  } catch (err) { res.status(500).json({ detail: err.message }); }
});

export default router;
