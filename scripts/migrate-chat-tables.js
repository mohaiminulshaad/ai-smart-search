/**
 * Database Migration: Add Chat and MCP Support Tables
 * Run this script to add tables for conversations, messages, and customer tokens
 */
import pool from '../config/database.js';

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting database migration...\n');

    // Create conversations table
    console.log('Creating conversations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Conversations table created\n');

    // Create messages table
    console.log('Creating messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);
    console.log('✓ Messages table created\n');

    // Create customer_tokens table
    console.log('Creating customer_tokens table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_tokens (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(255) UNIQUE NOT NULL,
        access_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Customer tokens table created\n');

    // Create indexes for better performance
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_shop_domain 
      ON conversations(shop_domain);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
      ON messages(conversation_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_created_at 
      ON messages(created_at);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_tokens_conversation_id 
      ON customer_tokens(conversation_id);
    `);
    console.log('✓ Indexes created\n');

    console.log('✅ Database migration completed successfully!\n');
    console.log('Tables created:');
    console.log('  - conversations');
    console.log('  - messages');
    console.log('  - customer_tokens\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
