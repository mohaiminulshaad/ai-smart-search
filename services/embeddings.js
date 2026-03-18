/**
 * Embedding Service
 * Generates embeddings using OpenAI's text-embedding-3-small model
 * Uses the openai SDK directly to guarantee the `dimensions` parameter
 * is always honoured — bypassing any LangChain module-load-time caching.
 */
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { RAG_CONFIG } from '../config/rag.js';

export class EmbeddingService {
  constructor() {
    this._openaiClient = null; // lazily created on first use
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CONFIG.chunking.maxChunkSize,
      chunkOverlap: RAG_CONFIG.chunking.overlap,
    });
  }

  // Lazy getter — creates the OpenAI client only when actually needed,
  // guaranteeing process.env.OPENAI_API_KEY is populated at that point.
  get client() {
    if (!this._openaiClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this._openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._openaiClient;
  }

  /**
   * Call the OpenAI embeddings API directly with explicit dimensions.
   * Returns a 2-D array (one float[] per input string).
   * Retries up to 3 times if the API silently returns wrong dimensions
   * (observed under concurrent load on some OpenAI project keys).
   */
  async _embed(texts, maxRetries = 3) {
    const expectedDim = RAG_CONFIG.embeddings.dimension;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await this.client.embeddings.create({
        model: RAG_CONFIG.embeddings.model,
        input: texts,
        dimensions: expectedDim,
      });
      // Sort by index to guarantee ordering (OpenAI docs allow reordering)
      const vectors = response.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
      // Verify dimensions — OpenAI occasionally returns wrong dims under load
      if (vectors[0]?.length === expectedDim) return vectors;
      console.warn(`[Embedding] ⚠️  Attempt ${attempt}/${maxRetries}: API returned ${vectors[0]?.length} dims instead of ${expectedDim}, retrying...`);
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
    throw new Error(`OpenAI returned wrong embedding dimensions after ${maxRetries} attempts. Expected ${expectedDim}.`);
  }

  /**
   * Prepare product text for embedding
   * Combines title, description, tags, variants, and collections
   */
  prepareProductText(product) {
    const parts = [];

    // Product title
    if (product.title) {
      parts.push(`Product: ${product.title}`);
    }

    // Vendor/brand
    if (product.vendor) {
      parts.push(`Brand: ${product.vendor}`);
    }

    // Product type
    if (product.product_type) {
      parts.push(`Type: ${product.product_type}`);
    }

    // Tags
    if (product.tags) {
      const tags = Array.isArray(product.tags) 
        ? product.tags.join(', ') 
        : product.tags;
      parts.push(`Tags: ${tags}`);
    }

    // Collections
    if (product.collections?.length > 0) {
      parts.push(`Collections: ${product.collections.map(c => c.title).join(', ')}`);
    }

    // Description (clean HTML)
    if (product.body_html) {
      const cleanDesc = product.body_html
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      if (cleanDesc) {
        parts.push(`Description: ${cleanDesc}`);
      }
    }

    // Variants (colors, sizes, materials)
    if (product.variants && product.variants.length > 0) {
      const variantInfo = product.variants.map(v => {
        const details = [];
        if (v.title && v.title !== 'Default Title') details.push(v.title);
        if (v.option1) details.push(v.option1);
        if (v.option2) details.push(v.option2);
        if (v.option3) details.push(v.option3);
        if (v.sku) details.push(`SKU: ${v.sku}`);
        return details.filter(Boolean).join(' ');
      }).filter(Boolean);
      
      if (variantInfo.length > 0) {
        parts.push(`Available in: ${variantInfo.join(', ')}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Extract metadata for filtering
   */
  extractMetadata(product) {
    const variants = product.variants || [];
    const firstVariant = variants[0] || {};

    return {
      product_id: product.id?.toString(),
      title: product.title,
      vendor: product.vendor || '',
      product_type: product.product_type || '',
      tags: Array.isArray(product.tags) ? product.tags : (product.tags || '').split(',').map(t => t.trim()),
      
      // Price range
      price_min: Math.min(...variants.map(v => parseFloat(v.price) || 0)),
      price_max: Math.max(...variants.map(v => parseFloat(v.price) || 0)),
      
      // Availability
      available: variants.some(v => v.inventory_quantity > 0),
      total_inventory: variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
      
      // Variants
      variant_count: variants.length,
      has_variants: variants.length > 1,
      
      // Options
      options: product.options?.map(opt => ({
        name: opt.name,
        values: opt.values
      })) || [],
      
      // Collections
      collection_titles: product.collections?.map(c => c.title) || [],

      // Handle (for storefront product URLs)
      handle: product.handle || '',

      // Images
      image_url: product.image?.src || product.images?.[0]?.src || '',
      images_count: product.images?.length || 0,
      
      // Status
      status: product.status || 'active',
      
      // Timestamps
      created_at: product.created_at,
      updated_at: product.updated_at,
      published_at: product.published_at,
    };
  }

  /**
   * Generate embeddings for a single product
   * Returns array of chunks with embeddings
   */
  async embedProduct(product) {
    try {
      const text = this.prepareProductText(product);
      const metadata = this.extractMetadata(product);

      // Split text into chunks if needed
      const chunks = await this.textSplitter.splitText(text);

      // Generate embeddings for all chunks directly via OpenAI SDK
      // _embed() already retries if the API returns wrong dimensions
      const embeddings = await this._embed(chunks);

      // Return chunks with their embeddings and metadata
      return chunks.map((chunk, index) => ({
        text: chunk,
        embedding: embeddings[index],
        metadata: {
          ...metadata,
          chunk_index: index,
          chunk_count: chunks.length,
        },
      }));
    } catch (error) {
      console.error(`[Embedding] Error embedding product ${product.id}:`, error);
      throw error;
    }
  }

  /**
   * Batch embed multiple products.
   * _embed() retries automatically if the API returns wrong dimensions.
   */
  async embedProducts(products) {
    const results = [];
    const batchSize = RAG_CONFIG.embeddings.batchSize;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      console.log(`[Embedding] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)}`);

      const batchResults = await Promise.all(
        batch.map(product => this.embedProduct(product))
      );

      results.push(...batchResults);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Generate embedding for a search query
   */
  async embedQuery(query) {
    try {
      const [vector] = await this._embed([query]);
      return vector;
    } catch (error) {
      console.error('[Embedding] Error embedding query:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated cost for embedding products
   */
  estimateCost(products) {
    const avgTokensPerProduct = 500; // Estimated average
    const totalTokens = products.length * avgTokensPerProduct;
    const costPer1M = RAG_CONFIG.embeddings.costPer1MTokens;
    const estimatedCost = (totalTokens / 1_000_000) * costPer1M;

    return {
      products: products.length,
      estimatedTokens: totalTokens,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    };
  }
}

export default EmbeddingService;
