/**
 * Scheduled Jobs
 * Background tasks for RAG system maintenance
 */
import cron from 'node-cron';
import pool from '../config/database.js';
import { ProductSyncService } from '../services/product-sync.js';
import { RAG_CONFIG } from '../config/rag.js';

const syncService = new ProductSyncService();

/**
 * Nightly full sync for all shops
 * Runs at 2 AM daily by default
 */
export function startNightlySync() {
  console.log(`[Cron] Scheduling nightly sync: ${RAG_CONFIG.sync.cronSchedule}`);

  cron.schedule(RAG_CONFIG.sync.cronSchedule, async () => {
    console.log('[Cron] Starting nightly full sync...');
    const startTime = Date.now();

    try {
      // Get all active shops
      const result = await pool.query('SELECT shop_domain FROM shops ORDER BY shop_domain');
      const shops = result.rows.map(r => r.shop_domain);

      console.log(`[Cron] Found ${shops.length} shops to sync`);

      let successCount = 0;
      let errorCount = 0;

      // Sync each shop
      for (const shopDomain of shops) {
        try {
          console.log(`[Cron] Syncing ${shopDomain}...`);
          const result = await syncService.syncShop(shopDomain, { fullRebuild: false });
          console.log(`[Cron] ✓ ${shopDomain}: ${result.productsProcessed} products, ${result.vectorsCreated} vectors`);
          successCount++;
        } catch (error) {
          console.error(`[Cron] ✗ Error syncing ${shopDomain}:`, error.message);
          errorCount++;
        }

        // Small delay between shops to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const duration = Date.now() - startTime;
      console.log(`[Cron] Nightly sync completed in ${(duration / 1000 / 60).toFixed(2)}min`);
      console.log(`[Cron] Results: ${successCount} successful, ${errorCount} errors`);

    } catch (error) {
      console.error('[Cron] Nightly sync failed:', error);
    }
  });

  console.log('[Cron] Nightly sync job scheduled');
}

/**
 * Cleanup old embedding records
 * Runs weekly to remove orphaned records
 */
export function startWeeklyCleanup() {
  // Run every Sunday at 3 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Cron] Starting weekly cleanup...');

    try {
      // Remove embeddings for shops that no longer exist
      const result = await pool.query(`
        DELETE FROM product_embeddings 
        WHERE shop_domain NOT IN (SELECT shop_domain FROM shops)
      `);

      console.log(`[Cron] Cleanup complete: removed ${result.rowCount} orphaned records`);
    } catch (error) {
      console.error('[Cron] Cleanup failed:', error);
    }
  });

  console.log('[Cron] Weekly cleanup job scheduled');
}

/**
 * Initialize all cron jobs
 */
export function initializeCronJobs() {
  try {
    startNightlySync();
    startWeeklyCleanup();
    console.log('[Cron] All scheduled jobs initialized');
  } catch (error) {
    console.error('[Cron] Failed to initialize cron jobs:', error);
  }
}

export default initializeCronJobs;
