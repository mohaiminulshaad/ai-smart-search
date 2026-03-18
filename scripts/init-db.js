import pool from '../config/database.js';

const createShopsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS shops (
      id SERIAL PRIMARY KEY,
      shop_domain VARCHAR(255) UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      scopes TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_shop_domain ON shops(shop_domain);

    CREATE TABLE IF NOT EXISTS product_embeddings (
      id                SERIAL PRIMARY KEY,
      shop_domain       TEXT NOT NULL,
      product_id        TEXT NOT NULL,
      shopify_product_id BIGINT,
      chunk_count       INTEGER DEFAULT 1,
      metadata          JSONB DEFAULT '{}',
      embedded_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (shop_domain, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_embeddings_shop ON product_embeddings(shop_domain);
  `;

  try {
    await pool.query(query);
    console.log('✓ Shops table created successfully');
    console.log('✓ Product embeddings table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating table:', error);
    process.exit(1);
  }
};

createShopsTable();
