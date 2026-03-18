/**
 * RAG Admin API Routes
 * Endpoints for managing embeddings and syncing
 */
import express from 'express';
import { ProductSyncService } from '../services/product-sync.js';
import { VectorStoreService } from '../services/vector-store.js';

const router = express.Router();
const syncService = new ProductSyncService();
const vectorStore = new VectorStoreService();

/**
 * POST /api/admin/sync/:shopDomain - Trigger full sync for a shop
 */
router.post('/admin/sync/:shopDomain', async (req, res) => {
  const { shopDomain } = req.params;
  const { fullRebuild = false } = req.body;

  try {
    const result = await syncService.syncShop(shopDomain, { fullRebuild });
    res.json(result);
  } catch (error) {
    console.error('[Admin] Sync error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/sync/status/:shopDomain - Get sync status
 */
router.get('/admin/sync/status/:shopDomain', async (req, res) => {
  const { shopDomain } = req.params;

  try {
    const status = await syncService.getSyncStatus(shopDomain);
    res.json(status);
  } catch (error) {
    console.error('[Admin] Status error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/sync/product - Sync a single product
 */
router.post('/admin/sync/product', async (req, res) => {
  const { shopDomain, productId } = req.body;

  if (!shopDomain || !productId) {
    return res.status(400).json({ error: 'shopDomain and productId required' });
  }

  try {
    const result = await syncService.syncProduct(shopDomain, productId);
    res.json(result);
  } catch (error) {
    console.error('[Admin] Product sync error:', error);
    res.status(500).json({
      error: 'Product sync failed',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/admin/sync/product - Delete a product from vector store
 */
router.delete('/admin/sync/product', async (req, res) => {
  const { shopDomain, productId } = req.body;

  if (!shopDomain || !productId) {
    return res.status(400).json({ error: 'shopDomain and productId required' });
  }

  try {
    const result = await syncService.deleteProduct(shopDomain, productId);
    res.json(result);
  } catch (error) {
    console.error('[Admin] Product delete error:', error);
    res.status(500).json({
      error: 'Product delete failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/qdrant/stats - Get Qdrant statistics
 */
router.get('/admin/qdrant/stats', async (req, res) => {
  const { shopDomain } = req.query;

  try {
    const stats = await vectorStore.getStats(shopDomain);
    res.json(stats);
  } catch (error) {
    console.error('[Admin] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/qdrant/initialize - Initialize Qdrant collection
 */
router.post('/admin/qdrant/initialize', async (req, res) => {
  try {
    await vectorStore.initializeCollection();
    const stats = await vectorStore.getStats();
    res.json({
      success: true,
      message: 'Collection initialized',
      stats,
    });
  } catch (error) {
    console.error('[Admin] Initialize error:', error);
    res.status(500).json({
      error: 'Initialization failed',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/admin/qdrant/shop/:shopDomain - Delete all vectors for a shop
 */
router.delete('/admin/qdrant/shop/:shopDomain', async (req, res) => {
  const { shopDomain } = req.params;

  try {
    await vectorStore.deleteShopProducts(shopDomain);
    res.json({
      success: true,
      message: `All vectors for ${shopDomain} deleted`,
    });
  } catch (error) {
    console.error('[Admin] Delete shop error:', error);
    res.status(500).json({
      error: 'Delete failed',
      message: error.message,
    });
  }
});

export default router;
