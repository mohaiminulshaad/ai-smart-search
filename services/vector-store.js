/**
 * Qdrant Vector Store Service
 * Manages Qdrant collections and vector operations.
 * Uses the openai SDK directly for embeddings to guarantee the `dimensions`
 * parameter is always honoured — bypassing any LangChain module-load-time caching.
 */
import OpenAI from 'openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { QdrantClient } from '@qdrant/qdrant-js';
import crypto from 'crypto';
import { RAG_CONFIG } from '../config/rag.js';

export class VectorStoreService {
  constructor() {
    this.client = new QdrantClient({
      url: RAG_CONFIG.qdrant.url,
    });

    this._openaiClient = null; // lazily created on first use

    this.collectionName = RAG_CONFIG.qdrant.collectionName;
    this.kbCollectionName = RAG_CONFIG.qdrant.kbCollectionName;
  }

  // Lazy getter — creates the OpenAI client only when actually needed.
  get openai() {
    if (!this._openaiClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this._openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._openaiClient;
  }

  /**
   * Embed a single query string via OpenAI SDK with explicit dimensions.
   * Retries if the API silently returns wrong dimensions under load.
   */
  async _embedQuery(text, maxRetries = 3) {
    const expectedDim = RAG_CONFIG.embeddings.dimension;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await this.openai.embeddings.create({
        model: RAG_CONFIG.embeddings.model,
        input: text,
        dimensions: expectedDim,
      });
      const vector = response.data[0].embedding;
      if (vector.length === expectedDim) return vector;
      console.warn(`[VectorStore] ⚠️  Attempt ${attempt}/${maxRetries}: query embed returned ${vector.length} dims, retrying...`);
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
    throw new Error(`OpenAI returned wrong query embedding dimensions after ${maxRetries} attempts.`);
  }

  /**
   * Initialize Qdrant collection with proper schema
   */
  async initializeCollection() {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (!exists) {
        console.log(`[Qdrant] Creating collection: ${this.collectionName}`);
        
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: RAG_CONFIG.qdrant.vectorSize,
            distance: 'Cosine',
          },
          // Enable optimizations
          optimizers_config: {
            indexing_threshold: 10000,
          },
          // Enable quantization for memory efficiency
          quantization_config: {
            scalar: {
              type: 'int8',
              quantile: 0.99,
              always_ram: true,
            },
          },
        });

        // Create payload indexes for fast filtering
        await this.createPayloadIndexes();

        console.log('[Qdrant] Collection created successfully');
      } else {
        console.log(`[Qdrant] Collection ${this.collectionName} already exists`);
      }

      return true;
    } catch (error) {
      console.error('[Qdrant] Error initializing collection:', error);
      throw error;
    }
  }

  /**
   * Create indexes on metadata fields for fast filtering
   */
  async createPayloadIndexes() {
    const indexes = [
      { field: 'metadata.shop_domain', type: 'keyword' },
      { field: 'metadata.product_id', type: 'keyword' },
      { field: 'metadata.vendor', type: 'keyword' },
      { field: 'metadata.product_type', type: 'keyword' },
      { field: 'metadata.tags', type: 'keyword' },
      { field: 'metadata.available', type: 'bool' },
      { field: 'metadata.price_min', type: 'float' },
      { field: 'metadata.price_max', type: 'float' },
      { field: 'metadata.status', type: 'keyword' },
      { field: 'metadata.collection_titles', type: 'keyword' },
    ];

    for (const index of indexes) {
      try {
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: index.field,
          field_schema: index.type,
        });
        console.log(`[Qdrant] Created index on ${index.field}`);
      } catch (error) {
        // Index might already exist, ignore
        if (!error.message?.includes('already exists')) {
          console.warn(`[Qdrant] Warning creating index on ${index.field}:`, error.message);
        }
      }
    }
  }

  /**
   * Get LangChain QdrantVectorStore instance for a specific shop
   */
  async getVectorStore(shopDomain) {
    try {
      await this.initializeCollection();

      // Build a LangChain-compatible embeddings wrapper backed by the OpenAI SDK.
      // This is only used by getVectorStore (admin tooling) — the hot path
      // (search) calls _embedQuery directly.
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      const lcEmbeddings = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        model: RAG_CONFIG.embeddings.model,
        dimensions: RAG_CONFIG.embeddings.dimension,
      });

      // Create the store without a baked-in filter (fromExistingCollection ignores it).
      // The shop_domain filter MUST be passed as the `filter` argument on every
      // similaritySearchVectorWithScore() / similaritySearchWithScore() call.
      const store = await QdrantVectorStore.fromExistingCollection(lcEmbeddings, {
        url: RAG_CONFIG.qdrant.url,
        collectionName: this.collectionName,
      });

      // Attach the required shop filter so callers can use it:
      //   store.similaritySearchWithScore(query, k, store.shopFilter)
      store.shopFilter = {
        must: [
          { key: 'metadata.shop_domain', match: { value: shopDomain } },
        ],
      };

      return store;
    } catch (error) {
      console.error('[Qdrant] Error getting vector store:', error);
      throw error;
    }
  }

  /**
   * Add product embeddings to Qdrant
   */
  async addProducts(shopDomain, productChunks) {
    try {
      await this.initializeCollection();

      const points = productChunks.flat().map((chunk, globalIndex) => {
        // Runtime dimension guard
        const actualDim = chunk.embedding?.length;
        const expectedDim = RAG_CONFIG.qdrant.vectorSize;
        if (actualDim !== expectedDim) {
          throw new Error(`[VectorStore] Dimension mismatch in chunk: expected ${expectedDim}, got ${actualDim}`);
        }
        // Generate a valid UUID for the point ID using MD5 hash
        const idString = `${shopDomain}_${chunk.metadata.product_id}_${chunk.metadata.chunk_index}`;
        const uuid = crypto.createHash('md5').update(idString).digest('hex');
        const formattedUuid = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20,32)}`;
        
        return {
          id: formattedUuid,
          vector: chunk.embedding,
          payload: {
            text: chunk.text,
            metadata: {
              shop_domain: shopDomain,
              ...chunk.metadata,
            },
          },
        };
      });

      // Batch upsert points
      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: batch,
        });
      }

      console.log(`[Qdrant] Added ${points.length} vectors for shop ${shopDomain}`);
      return points.length;
    } catch (error) {
      console.error('[Qdrant] Error adding products:', error);
      throw error;
    }
  }

  /**
   * Delete product from Qdrant
   */
  async deleteProduct(shopDomain, productId) {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.shop_domain',
              match: { value: shopDomain },
            },
            {
              key: 'metadata.product_id',
              match: { value: productId.toString() },
            },
          ],
        },
      });

      console.log(`[Qdrant] Deleted product ${productId} from shop ${shopDomain}`);
    } catch (error) {
      console.error('[Qdrant] Error deleting product:', error);
      throw error;
    }
  }

  /**
   * Delete all products for a shop
   */
  async deleteShopProducts(shopDomain) {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.shop_domain',
              match: { value: shopDomain },
            },
          ],
        },
      });

      console.log(`[Qdrant] Deleted all products for shop ${shopDomain}`);
    } catch (error) {
      console.error('[Qdrant] Error deleting shop products:', error);
      throw error;
    }
  }

  /**
   * Hybrid search: Semantic + Keyword + Filters
   */
  async search(shopDomain, query, options = {}) {
    try {
      const {
        limit = RAG_CONFIG.search.topK,
        minScore = RAG_CONFIG.search.minScore,
        filters = {},
      } = options;

      // Build filter conditions
      const filterConditions = [
        {
          key: 'metadata.shop_domain',
          match: { value: shopDomain },
        },
      ];

      // Add availability filter
      if (filters.availableOnly) {
        filterConditions.push({
          key: 'metadata.available',
          match: { value: true },
        });
      }

      // Add price range filter
      if (filters.minPrice !== undefined) {
        filterConditions.push({
          key: 'metadata.price_min',
          range: { gte: filters.minPrice },
        });
      }
      if (filters.maxPrice !== undefined) {
        filterConditions.push({
          key: 'metadata.price_max',
          range: { lte: filters.maxPrice },
        });
      }

      // Add vendor filter
      if (filters.vendor) {
        filterConditions.push({
          key: 'metadata.vendor',
          match: { value: filters.vendor },
        });
      }

      // Add product type filter
      if (filters.productType) {
        filterConditions.push({
          key: 'metadata.product_type',
          match: { value: filters.productType },
        });
      }

      // Add tag filter
      if (filters.tag) {
        filterConditions.push({
          key: 'metadata.tags',
          match: { any: [filters.tag] },
        });
      }

      // ── Direct Qdrant client search (shop_domain filter is ALWAYS enforced) ──
      // NOTE: QdrantVectorStore.fromExistingCollection() silently ignores the
      // `filter` field in dbConfig — the filter is only applied when passed as
      // a call-time argument to similaritySearchVectorWithScore(). Using the
      // raw client here guarantees per-shop isolation with no leakage.
      await this.initializeCollection();

      // Embed the query directly via OpenAI SDK
      const queryVector = await this._embedQuery(query);

      // Query Qdrant directly — filter is part of the request, cannot be skipped
      const searchResponse = await this.client.query(this.collectionName, {
        query: queryVector,
        limit,
        filter: { must: filterConditions },
        with_payload: true,
        with_vector: false,
        score_threshold: minScore,
      });

      const points = searchResponse.points ?? searchResponse ?? [];

      // Deduplicate by product_id, keeping highest-scoring chunk per product
      const uniqueProducts = new Map();
      for (const point of points) {
        const meta = point.payload?.metadata ?? {};
        // Double-check shop isolation (defence-in-depth)
        if (meta.shop_domain && meta.shop_domain !== shopDomain) {
          console.warn(`[Qdrant] ⚠️  shop_domain mismatch in result — expected ${shopDomain}, got ${meta.shop_domain} — skipping`);
          continue;
        }
        const productId = meta.product_id;
        const score = point.score ?? 0;
        if (!uniqueProducts.has(productId) || uniqueProducts.get(productId).score < score) {
          uniqueProducts.set(productId, {
            ...meta,
            text: point.payload?.content ?? point.payload?.text ?? '',
            score,
          });
        }
      }

      return Array.from(uniqueProducts.values()).sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('[Qdrant] Error searching:', error);
      throw error;
    }
  }

  /**
   * Search for similar products within a specific collection,
   * excluding already-shown product IDs.
   */
  async searchSimilar(shopDomain, query, collectionTitle, excludeProductIds = [], limit = 4) {
    try {
      await this.initializeCollection();

      const queryVector = await this._embedQuery(query);

      const mustConditions = [
        { key: 'metadata.shop_domain', match: { value: shopDomain } },
        { key: 'metadata.collection_titles', match: { value: collectionTitle } },
      ];

      const mustNotConditions = excludeProductIds.map(pid => ({
        key: 'metadata.product_id',
        match: { value: pid.toString() },
      }));

      const filter = { must: mustConditions };
      if (mustNotConditions.length > 0) {
        filter.must_not = mustNotConditions;
      }

      const searchResponse = await this.client.query(this.collectionName, {
        query: queryVector,
        limit,
        filter,
        with_payload: true,
        with_vector: false,
        score_threshold: RAG_CONFIG.search.minScore,
      });

      const points = searchResponse.points ?? searchResponse ?? [];

      // Deduplicate by product_id
      const uniqueProducts = new Map();
      for (const point of points) {
        const meta = point.payload?.metadata ?? {};
        if (meta.shop_domain && meta.shop_domain !== shopDomain) continue;
        const productId = meta.product_id;
        const score = point.score ?? 0;
        if (!uniqueProducts.has(productId) || uniqueProducts.get(productId).score < score) {
          uniqueProducts.set(productId, {
            ...meta,
            text: point.payload?.content ?? point.payload?.text ?? '',
            score,
          });
        }
      }

      return Array.from(uniqueProducts.values()).sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('[Qdrant] Error searching similar:', error);
      return [];
    }
  }

  /**
   * Search for similar products by a metadata field (product_type, vendor, etc.),
   * excluding already-shown product IDs.
   */
  async searchByField(shopDomain, query, fieldName, fieldValue, excludeProductIds = [], limit = 4) {
    try {
      await this.initializeCollection();

      const queryVector = await this._embedQuery(query);

      const mustConditions = [
        { key: 'metadata.shop_domain', match: { value: shopDomain } },
        { key: `metadata.${fieldName}`, match: { value: fieldValue } },
      ];

      const mustNotConditions = excludeProductIds.map(pid => ({
        key: 'metadata.product_id',
        match: { value: pid.toString() },
      }));

      const filter = { must: mustConditions };
      if (mustNotConditions.length > 0) {
        filter.must_not = mustNotConditions;
      }

      const searchResponse = await this.client.query(this.collectionName, {
        query: queryVector,
        limit,
        filter,
        with_payload: true,
        with_vector: false,
        score_threshold: RAG_CONFIG.search.minScore,
      });

      const points = searchResponse.points ?? searchResponse ?? [];

      const uniqueProducts = new Map();
      for (const point of points) {
        const meta = point.payload?.metadata ?? {};
        if (meta.shop_domain && meta.shop_domain !== shopDomain) continue;
        const productId = meta.product_id;
        const score = point.score ?? 0;
        if (!uniqueProducts.has(productId) || uniqueProducts.get(productId).score < score) {
          uniqueProducts.set(productId, {
            ...meta,
            text: point.payload?.content ?? point.payload?.text ?? '',
            score,
          });
        }
      }

      return Array.from(uniqueProducts.values()).sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('[Qdrant] Error searching by field:', error);
      return [];
    }
  }

  // ── Knowledge Base Collection ──────────────────────────────────────────────

  /**
   * Initialize the knowledge base collection in Qdrant.
   */
  async initializeKBCollection() {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.kbCollectionName);

      if (!exists) {
        console.log(`[Qdrant] Creating KB collection: ${this.kbCollectionName}`);
        await this.client.createCollection(this.kbCollectionName, {
          vectors: { size: RAG_CONFIG.qdrant.vectorSize, distance: 'Cosine' },
          optimizers_config: { indexing_threshold: 5000 },
        });

        // Create payload indexes for KB
        for (const idx of [
          { field: 'metadata.shop_domain', type: 'keyword' },
          { field: 'metadata.doc_id', type: 'keyword' },
        ]) {
          try {
            await this.client.createPayloadIndex(this.kbCollectionName, {
              field_name: idx.field, field_schema: idx.type,
            });
          } catch { /* index might already exist */ }
        }
        console.log('[Qdrant] KB collection created');
      }
      return true;
    } catch (error) {
      console.error('[Qdrant] Error initializing KB collection:', error);
      throw error;
    }
  }

  /**
   * Upsert Q&A pairs into the KB collection.
   * Each entry: { question, answer, doc_id, shop_domain }
   */
  async upsertKBEntries(shopDomain, docId, qaPairs) {
    await this.initializeKBCollection();

    const questions = qaPairs.map(qa => qa.question);
    // Batch embed all questions
    const expectedDim = RAG_CONFIG.embeddings.dimension;
    const response = await this.openai.embeddings.create({
      model: RAG_CONFIG.embeddings.model,
      input: questions,
      dimensions: expectedDim,
    });
    const vectors = response.data.sort((a, b) => a.index - b.index).map(d => d.embedding);

    const points = qaPairs.map((qa, i) => ({
      id: crypto.randomUUID(),
      vector: vectors[i],
      payload: {
        content: qa.question,
        metadata: {
          shop_domain: shopDomain,
          doc_id: docId,
          question: qa.question,
          answer: qa.answer,
        },
      },
    }));

    // Upsert in batches of 100
    for (let i = 0; i < points.length; i += 100) {
      await this.client.upsert(this.kbCollectionName, {
        wait: true,
        points: points.slice(i, i + 100),
      });
    }

    console.log(`[Qdrant] Upserted ${points.length} KB entries for doc ${docId}`);
    return points.length;
  }

  /**
   * Search the knowledge base for relevant Q&A pairs.
   */
  async searchKB(shopDomain, query, limit = 3, minScore = 0.35) {
    try {
      await this.initializeKBCollection();

      const queryVector = await this._embedQuery(query);

      const searchResponse = await this.client.query(this.kbCollectionName, {
        query: queryVector,
        limit,
        filter: {
          must: [{ key: 'metadata.shop_domain', match: { value: shopDomain } }],
        },
        with_payload: true,
        with_vector: false,
        score_threshold: minScore,
      });

      const points = searchResponse.points ?? searchResponse ?? [];
      return points.map(p => ({
        question: p.payload?.metadata?.question ?? '',
        answer: p.payload?.metadata?.answer ?? '',
        score: p.score ?? 0,
        doc_id: p.payload?.metadata?.doc_id ?? '',
      }));
    } catch (error) {
      console.error('[Qdrant] Error searching KB:', error);
      return [];
    }
  }

  /**
   * Delete all KB entries for a specific document.
   */
  async deleteKBByDocId(shopDomain, docId) {
    try {
      await this.initializeKBCollection();

      await this.client.delete(this.kbCollectionName, {
        wait: true,
        filter: {
          must: [
            { key: 'metadata.shop_domain', match: { value: shopDomain } },
            { key: 'metadata.doc_id', match: { value: docId } },
          ],
        },
      });
      console.log(`[Qdrant] Deleted KB entries for doc ${docId}`);
    } catch (error) {
      console.error('[Qdrant] Error deleting KB entries:', error);
    }
  }

  /**
   * Get collection stats
   */
  async getStats(shopDomain = null) {
    try {
      const collectionInfo = await this.client.getCollection(this.collectionName);
      
      let shopStats = null;
      if (shopDomain) {
        const count = await this.client.count(this.collectionName, {
          filter: {
            must: [
              {
                key: 'metadata.shop_domain',
                match: { value: shopDomain },
              },
            ],
          },
        });
        shopStats = { shopDomain, vectorCount: count.count };
      }

      return {
        collection: this.collectionName,
        totalVectors: collectionInfo.points_count,
        vectorSize: collectionInfo.config.params.vectors.size,
        shopStats,
      };
    } catch (error) {
      console.error('[Qdrant] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const collections = await this.client.getCollections();
      return collections && collections.collections !== undefined;
    } catch (error) {
      console.error('[Qdrant] Health check failed:', error.message);
      return false;
    }
  }
}

export default VectorStoreService;
