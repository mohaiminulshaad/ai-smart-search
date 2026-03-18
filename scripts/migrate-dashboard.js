/**
 * scripts/migrate-dashboard.js
 * Adds the `scopes` column to the existing shops table and creates
 * all dashboard-related tables (idempotent — safe to re-run).
 */

import dotenv from 'dotenv';
dotenv.config();

import pool from '../config/database.js';
import { initDashboardDb } from '../config/dashboard-db.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄  Running dashboard migration…');

    // Add scopes column to shops table (no-op if already present)
    await client.query(`
      ALTER TABLE shops
        ADD COLUMN IF NOT EXISTS scopes TEXT NOT NULL DEFAULT '';
    `);
    console.log('  ✅  shops.scopes column ensured');

    // Make access_token nullable so we can clear it on uninstall without deleting the row
    await client.query(`
      ALTER TABLE shops ALTER COLUMN access_token DROP NOT NULL;
    `);
    console.log('  ✅  shops.access_token is nullable');

    // Create all dashboard tables
    await initDashboardDb();
    console.log('  ✅  Dashboard tables created / verified');

    console.log('\n✅  Migration complete!');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
