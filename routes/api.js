import express from 'express';
import axios from 'axios';
import pool from '../config/database.js';
import { decryptToken, isValidShopDomain } from '../utils/crypto.js';

const router = express.Router();

/**
 * GET /api/shops - List all installed shops
 */
router.get('/shops', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT shop_domain, created_at FROM shops ORDER BY created_at DESC'
    );
    res.json({ shops: result.rows });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

/**
 * GET /api/products - Fetch products from Shopify
 */
router.get('/products', async (req, res) => {
  const shopDomain = req.headers['x-shop-domain'];

  try {
    // Validate shop domain
    if (!shopDomain || !isValidShopDomain(shopDomain)) {
      return res.status(400).json({ 
        error: 'Invalid or missing X-Shop-Domain header' 
      });
    }

    // Get shop from database
    const result = await pool.query(
      'SELECT access_token FROM shops WHERE shop_domain = $1',
      [shopDomain]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Shop not found. Please reinstall the app.',
        shop: shopDomain
      });
    }

    // Decrypt access token
    const accessToken = decryptToken(result.rows[0].access_token);

    // Try REST API first (simpler and more reliable)
    try {
      const restResponse = await axios.get(
        `https://${shopDomain}/admin/api/2024-01/products.json?limit=50`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken
          }
        }
      );

      // Transform REST API response to match our format
      const products = restResponse.data.products.map(product => ({
        id: `gid://shopify/Product/${product.id}`,
        title: product.title,
        image: product.images[0]?.src || null,
        totalInventory: product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
        variants: product.variants.map(v => ({
          id: `gid://shopify/ProductVariant/${v.id}`,
          price: v.price,
          inventoryQuantity: v.inventory_quantity || 0,
          sku: v.sku || ''
        }))
      }));

      return res.json({
        shop: shopDomain,
        products
      });
    } catch (restError) {
      console.error('REST API failed, trying GraphQL:', restError.message);
    }

    // Fallback to GraphQL if REST fails
    // GraphQL query for products
    const query = `
      {
        products(first: 50) {
          edges {
            node {
              id
              title
              totalInventory
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Make GraphQL request to Shopify
    const response = await axios.post(
      `https://${shopDomain}/admin/api/2024-01/graphql.json`,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    // Check for GraphQL errors
    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors);
      return res.status(400).json({ 
        error: 'GraphQL query failed',
        details: response.data.errors
      });
    }

    // Check if data exists
    if (!response.data.data || !response.data.data.products) {
      console.error('No product data in response:', response.data);
      return res.status(500).json({ 
        error: 'Invalid response from Shopify API',
        details: response.data
      });
    }

    // Transform response
    const products = response.data.data.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      image: edge.node.images.edges[0]?.node.url || null,
      totalInventory: edge.node.totalInventory,
      variants: edge.node.variants.edges.map(v => ({
        id: v.node.id,
        price: v.node.price,
        inventoryQuantity: v.node.inventoryQuantity,
        sku: v.node.sku
      }))
    }));

    res.json({
      shop: shopDomain,
      products
    });

  } catch (error) {
    console.error('Product fetch error:', error.response?.data || error.message);
    
    // Handle specific Shopify API errors
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Invalid access token. Please reinstall the app.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.response?.data || error.message
    });
  }
});

/**
 * POST /api/verify-session - Verify shop has valid token
 */
router.post('/verify-session', async (req, res) => {
  const { shop } = req.body;

  try {
    if (!shop || !isValidShopDomain(shop)) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    const result = await pool.query(
      'SELECT id FROM shops WHERE shop_domain = $1',
      [shop]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Shop not found',
        needsAuth: true 
      });
    }

    res.json({ 
      success: true,
      shop 
    });

  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
