/**
 * Product Sync Service
 * Syncs products from Shopify to Qdrant vector store
 */
import axios from 'axios';
import pool from '../config/database.js';
import { decryptToken } from '../utils/crypto.js';
import { EmbeddingService } from './embeddings.js';
import { VectorStoreService } from './vector-store.js';

export class ProductSyncService {
  constructor() {
    this.embeddingService = new EmbeddingService();
    this.vectorStore = new VectorStoreService();
  }

  /**
   * Fetch all products from Shopify for a shop
   */
  async fetchShopifyProducts(shopDomain) {
    try {
      // Get access token from database
      const result = await pool.query(
        'SELECT access_token FROM shops WHERE shop_domain = $1',
        [shopDomain]
      );

      if (result.rows.length === 0) {
        throw new Error(`Shop ${shopDomain} not found in database`);
      }

      const encryptedToken = result.rows[0].access_token;
      const accessToken = decryptToken(encryptedToken);

      // Fetch products from Shopify API
      let allProducts = [];
      let pageInfo = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const url = pageInfo
          ? `https://${shopDomain}/admin/api/2024-01/products.json?limit=250&page_info=${pageInfo}`
          : `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`;

        const response = await axios.get(url, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        });

        allProducts = allProducts.concat(response.data.products);

        // Check for pagination
        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }

        // Small delay to respect rate limits
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`[Sync] Fetched ${allProducts.length} products from ${shopDomain}`);
      return allProducts;
    } catch (error) {
      console.error(`[Sync] Error fetching products from ${shopDomain}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch all custom + smart collections for a shop.
   * Returns array of { id, title, handle }.
   */
  async fetchCollections(shopDomain, accessToken) {
    const collections = [];
    for (const type of ['custom_collections', 'smart_collections']) {
      try {
        let url = `https://${shopDomain}/admin/api/2024-01/${type}.json?limit=250`;
        while (url) {
          const response = await axios.get(url, {
            headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          });
          const items = response.data[type] || [];
          collections.push(...items.map(c => ({ id: c.id, title: c.title, handle: c.handle })));

          const linkHeader = response.headers.link;
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            url = match ? match[1] : null;
          } else {
            url = null;
          }
          if (url) await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.warn(`[Sync] Warning fetching ${type} for ${shopDomain}:`, err.message);
      }
    }
    console.log(`[Sync] Fetched ${collections.length} collections from ${shopDomain}`);
    return collections;
  }

  /**
   * Build a Map<productId, [{ id, title }]> using the Collects API.
   */
  async buildProductCollectionMap(shopDomain, accessToken) {
    const collections = await this.fetchCollections(shopDomain, accessToken);
    const collectionById = new Map(collections.map(c => [c.id, c]));
    const productMap = new Map(); // productId (string) -> [{ id, title }]

    let url = `https://${shopDomain}/admin/api/2024-01/collects.json?limit=250`;
    while (url) {
      try {
        const response = await axios.get(url, {
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        });
        const collects = response.data.collects || [];
        for (const collect of collects) {
          const col = collectionById.get(collect.collection_id);
          if (!col) continue;
          const pid = collect.product_id.toString();
          if (!productMap.has(pid)) productMap.set(pid, []);
          const existing = productMap.get(pid);
          if (!existing.some(c => c.id === col.id)) {
            existing.push({ id: col.id, title: col.title });
          }
        }

        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          url = match ? match[1] : null;
        } else {
          url = null;
        }
        if (url) await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.warn(`[Sync] Warning fetching collects for ${shopDomain}:`, err.message);
        url = null;
      }
    }

    console.log(`[Sync] Built collection map for ${productMap.size} products`);
    return productMap;
  }

  /**
   * Sync all products for a shop to Qdrant
   */
  async syncShop(shopDomain, options = {}) {
    const { fullRebuild = false } = options;

    try {
      console.log(`[Sync] Starting sync for ${shopDomain}...`);
      const startTime = Date.now();

      // Initialize Qdrant collection
      await this.vectorStore.initializeCollection();

      // If full rebuild, delete existing vectors
      if (fullRebuild) {
        console.log('[Sync] Full rebuild requested, deleting existing vectors...');
        await this.vectorStore.deleteShopProducts(shopDomain);
        await pool.query('DELETE FROM product_embeddings WHERE shop_domain = $1', [shopDomain]);
      }

      // Fetch products from Shopify
      const products = await this.fetchShopifyProducts(shopDomain);

      // Enrich products with collection data
      try {
        const result = await pool.query(
          'SELECT access_token FROM shops WHERE shop_domain = $1',
          [shopDomain]
        );
        if (result.rows.length > 0) {
          const accessToken = decryptToken(result.rows[0].access_token);
          const collectionMap = await this.buildProductCollectionMap(shopDomain, accessToken);
          for (const product of products) {
            product.collections = collectionMap.get(product.id.toString()) || [];
          }
        }
      } catch (err) {
        console.warn('[Sync] Warning: could not fetch collections, continuing without:', err.message);
      }

      if (products.length === 0) {
        console.log(`[Sync] No products found for ${shopDomain}`);
        return {
          success: true,
          productsProcessed: 0,
          vectorsCreated: 0,
          duration: Date.now() - startTime,
        };
      }

      // Estimate cost
      const costEstimate = this.embeddingService.estimateCost(products);
      console.log(`[Sync] Cost estimate:`, costEstimate);

      // Generate embeddings
      console.log(`[Sync] Generating embeddings for ${products.length} products...`);
      const productChunks = await this.embeddingService.embedProducts(products);

      // Add to Qdrant
      console.log('[Sync] Adding vectors to Qdrant...');
      const vectorCount = await this.vectorStore.addProducts(shopDomain, productChunks);

      // Update tracking table
      console.log('[Sync] Updating embedding tracking...');
      for (const product of products) {
        await pool.query(
          `INSERT INTO product_embeddings (shop_domain, product_id, shopify_product_id, chunk_count, metadata)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (shop_domain, product_id) 
           DO UPDATE SET 
             embedded_at = NOW(),
             chunk_count = $4,
             metadata = $5`,
          [
            shopDomain,
            product.id.toString(),
            product.id,
            productChunks.find(chunks => chunks[0]?.metadata.product_id === product.id.toString())?.length || 1,
            JSON.stringify({
              title: product.title,
              updated_at: product.updated_at,
            }),
          ]
        );
      }

      const duration = Date.now() - startTime;
      console.log(`[Sync] Sync completed in ${(duration / 1000).toFixed(2)}s`);

      return {
        success: true,
        shopDomain,
        productsProcessed: products.length,
        vectorsCreated: vectorCount,
        duration,
        costEstimate,
      };
    } catch (error) {
      console.error(`[Sync] Error syncing shop ${shopDomain}:`, error);
      throw error;
    }
  }

  /**
   * Sync a single product
   */
  async syncProduct(shopDomain, productId) {
    try {
      console.log(`[Sync] Syncing product ${productId} for ${shopDomain}...`);

      // Get access token
      const result = await pool.query(
        'SELECT access_token FROM shops WHERE shop_domain = $1',
        [shopDomain]
      );

      if (result.rows.length === 0) {
        throw new Error(`Shop ${shopDomain} not found`);
      }

      const accessToken = decryptToken(result.rows[0].access_token);

      // Fetch product from Shopify
      const response = await axios.get(
        `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const product = response.data.product;

      // Enrich with collection data
      try {
        const collectionMap = await this.buildProductCollectionMap(shopDomain, accessToken);
        product.collections = collectionMap.get(product.id.toString()) || [];
      } catch (err) {
        console.warn('[Sync] Warning: could not fetch collections for product:', err.message);
        product.collections = [];
      }

      // Delete existing vectors for this product
      await this.vectorStore.deleteProduct(shopDomain, productId);

      // Generate new embeddings
      const chunks = await this.embeddingService.embedProduct(product);

      // Add to Qdrant
      await this.vectorStore.addProducts(shopDomain, [chunks]);

      // Update tracking
      await pool.query(
        `INSERT INTO product_embeddings (shop_domain, product_id, shopify_product_id, chunk_count, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (shop_domain, product_id) 
         DO UPDATE SET 
           embedded_at = NOW(),
           chunk_count = $4,
           metadata = $5`,
        [
          shopDomain,
          productId.toString(),
          productId,
          chunks.length,
          JSON.stringify({
            title: product.title,
            updated_at: product.updated_at,
          }),
        ]
      );

      console.log(`[Sync] Product ${productId} synced successfully`);
      return { success: true, productId, chunksCreated: chunks.length };
    } catch (error) {
      console.error(`[Sync] Error syncing product ${productId}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a product from vector store
   */
  async deleteProduct(shopDomain, productId) {
    try {
      await this.vectorStore.deleteProduct(shopDomain, productId);
      await pool.query(
        'DELETE FROM product_embeddings WHERE shop_domain = $1 AND product_id = $2',
        [shopDomain, productId.toString()]
      );
      console.log(`[Sync] Product ${productId} deleted`);
      return { success: true };
    } catch (error) {
      console.error(`[Sync] Error deleting product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Delete all products for a shop (used when shop uninstalls)
   */
  async deleteShopProducts(shopDomain) {
    try {
      // Delete from vector store
      await this.vectorStore.deleteShopProducts(shopDomain);
      
      // Delete from PostgreSQL
      const result = await pool.query(
        'DELETE FROM product_embeddings WHERE shop_domain = $1',
        [shopDomain]
      );
      
      console.log(`[Sync] Deleted ${result.rowCount} product embeddings for ${shopDomain}`);
      return { success: true, deletedCount: result.rowCount };
    } catch (error) {
      console.error(`[Sync] Error deleting shop products for ${shopDomain}:`, error);
      throw error;
    }
  }

  /**
   * Get sync status for a shop
   */
  async getSyncStatus(shopDomain) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as embedded_count,
          MAX(embedded_at) as last_sync,
          MIN(embedded_at) as first_sync
         FROM product_embeddings 
         WHERE shop_domain = $1`,
        [shopDomain]
      );

      const stats = await this.vectorStore.getStats(shopDomain);

      return {
        shopDomain,
        embeddedProducts: parseInt(result.rows[0].embedded_count),
        vectorCount: stats.shopStats?.vectorCount || 0,
        lastSync: result.rows[0].last_sync,
        firstSync: result.rows[0].first_sync,
      };
    } catch (error) {
      console.error(`[Sync] Error getting sync status:`, error);
      throw error;
    }
  }
}

export default ProductSyncService;
