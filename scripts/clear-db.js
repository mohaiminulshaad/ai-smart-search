/**
 * Clear all database data (PostgreSQL + Qdrant).
 * Usage: npm run clear-db
 */
import pool from '../config/database.js';
import { QdrantClient } from '@qdrant/qdrant-js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'shopify_products';

async function clearDatabase() {
  console.log('Clearing all database data...\n');

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  // Truncate in FK-safe order (children first)
  const tables = [
    'chat_messages',
    'chat_sessions',
    'knowledge_base',
    'api_keys',
    'display_settings',
    'smartSearch_settings',
    'product_embeddings',
    'messages',
    'customer_tokens',
    'conversations',
    'shops',
  ];

  for (const table of tables) {
    try {
      await pool.query(`TRUNCATE TABLE "${table}" CASCADE`);
      console.log(`  PostgreSQL: truncated ${table}`);
    } catch (err) {
      if (err.code === '42P01') {
        // table does not exist — skip silently
        console.log(`  PostgreSQL: ${table} does not exist, skipping`);
      } else {
        console.error(`  PostgreSQL: error truncating ${table}:`, err.message);
      }
    }
  }

  // ── Qdrant ──────────────────────────────────────────────────────────────────
  try {
    const qdrant = new QdrantClient({ url: QDRANT_URL });
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (exists) {
      // Delete all points by scrolling (no filter = all points)
      await qdrant.delete(COLLECTION_NAME, {
        filter: { must: [] },
        wait: true,
      });
      console.log(`\n  Qdrant: cleared all points from ${COLLECTION_NAME}`);
    } else {
      console.log(`\n  Qdrant: collection ${COLLECTION_NAME} does not exist, skipping`);
    }
  } catch (err) {
    console.error(`\n  Qdrant: error clearing collection:`, err.message);
  }

  console.log('\nDone.');
  await pool.end();
  process.exit(0);
}

clearDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
