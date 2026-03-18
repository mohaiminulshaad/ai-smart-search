import express from 'express';
import crypto from 'crypto';
import pool from '../config/database.js';
import { ProductSyncService } from '../services/product-sync.js';

const router = express.Router();
const syncService = new ProductSyncService();

// Batch queue for product updates (avoid redundant syncs)
const updateQueue = new Map();
const BATCH_DELAY = 5000; // 5 seconds

/**
 * Verify Shopify webhook HMAC
 */
const verifyWebhook = (req) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  
  if (!hmac) {
    return false;
  }

  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(req.body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(hash)
  );
};

/**
 * POST /webhooks/app-uninstalled
 * Shopify calls this when merchant uninstalls the app
 */
router.post('/app-uninstalled', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook authenticity
    if (!verifyWebhook(req)) {
      console.error('❌ Webhook HMAC verification failed');
      return res.status(401).send('Unauthorized');
    }

    // Parse webhook payload
    const payload = JSON.parse(req.body.toString());
    // Always use myshopify_domain — it matches what OAuth stores.
    // payload.domain can be a custom domain (e.g. ibfapps.myshopify.com vs my-test-store-123456789129.myshopify.com)
    const shopDomain = payload.myshopify_domain || payload.domain;

    console.log(`🗑️  App uninstalled webhook received for: ${shopDomain}`);

    // Respond immediately to Shopify (must be within 5s)
    res.status(200).send('OK');

    // Run all cleanup asynchronously after responding
    try {
      // 1. Delete Qdrant vectors + product_embeddings rows
      await syncService.deleteShopProducts(shopDomain);
      console.log(`✓ Qdrant vectors cleaned for ${shopDomain}`);
    } catch (err) {
      console.error(`⚠️  Error cleaning Qdrant vectors for ${shopDomain}:`, err.message);
    }

    try {
      // 2. Delete chat sessions and messages
      await pool.query('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE shop = $1)', [shopDomain]);
      const sessResult = await pool.query('DELETE FROM chat_sessions WHERE shop = $1', [shopDomain]);
      console.log(`✓ Deleted ${sessResult.rowCount} chat sessions for ${shopDomain}`);
    } catch (err) {
      console.error(`⚠️  Error cleaning chat sessions for ${shopDomain}:`, err.message);
    }

    try {
      // 3. Clear the access_token so re-installs trigger fresh OAuth.
      //    IMPORTANT: If the token was updated within the last 30 seconds, a
      //    re-install just completed — skip the null to avoid a race condition
      //    where Shopify delivers the old app/uninstalled webhook AFTER the new
      //    install's callback has already saved a fresh token.
      const recentInstall = await pool.query(
        `SELECT id FROM shops
         WHERE shop_domain = $1
           AND updated_at > NOW() - INTERVAL '30 seconds'`,
        [shopDomain]
      );

      if (recentInstall.rowCount > 0) {
        console.log(`⏭️  Skipping token clear for ${shopDomain} — fresh install detected (updated < 30s ago)`);
      } else {
        const result = await pool.query(
          `UPDATE shops SET access_token = '', scopes = '', updated_at = NOW()
           WHERE shop_domain = $1 RETURNING id`,
          [shopDomain]
        );
        if (result.rowCount > 0) {
          console.log(`✓ Cleared token for ${shopDomain} (uninstalled)`);
        } else {
          console.log(`⚠️  Shop ${shopDomain} not found in database`);
        }
      }
    } catch (err) {
      console.error(`⚠️  Error clearing token for ${shopDomain}:`, err.message);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Error');
  }
});

/**
 * POST /webhooks/products-create
 * Shopify calls this when a new product is created
 */
router.post('/products-create', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!verifyWebhook(req)) {
      return res.status(401).send('Unauthorized');
    }

    const product = JSON.parse(req.body.toString());
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    console.log(`➕ Product created: ${product.id} (${product.title}) for ${shopDomain}`);

    // Queue for sync (batch updates)
    queueProductUpdate(shopDomain, product.id);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Products create webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * POST /webhooks/products-update
 * Shopify calls this when a product is updated
 */
router.post('/products-update', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!verifyWebhook(req)) {
      return res.status(401).send('Unauthorized');
    }

    const product = JSON.parse(req.body.toString());
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    console.log(`✏️  Product updated: ${product.id} (${product.title}) for ${shopDomain}`);

    // Queue for sync
    queueProductUpdate(shopDomain, product.id);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Products update webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * POST /webhooks/products-delete
 * Shopify calls this when a product is deleted
 */
router.post('/products-delete', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!verifyWebhook(req)) {
      return res.status(401).send('Unauthorized');
    }

    const product = JSON.parse(req.body.toString());
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    console.log(`🗑️  Product deleted: ${product.id} for ${shopDomain}`);

    // Delete immediately (no batching)
    syncService.deleteProduct(shopDomain, product.id).catch(err =>
      console.error(`Error deleting product ${product.id}:`, err)
    );

    res.status(200).send('OK');
  } catch (error) {
    console.error('Products delete webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * Queue product update with batching
 */
function queueProductUpdate(shopDomain, productId) {
  const key = `${shopDomain}_${productId}`;
  
  // Clear existing timer for this product
  if (updateQueue.has(key)) {
    clearTimeout(updateQueue.get(key).timer);
  }

  // Set new timer
  const timer = setTimeout(async () => {
    updateQueue.delete(key);
    try {
      await syncService.syncProduct(shopDomain, productId);
      console.log(`✓ Synced product ${productId} for ${shopDomain}`);
    } catch (error) {
      console.error(`Error syncing product ${productId}:`, error);
    }
  }, BATCH_DELAY);

  updateQueue.set(key, { shopDomain, productId, timer });
}

export default router;
