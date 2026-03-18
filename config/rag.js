/**
 * RAG Configuration
 * Central configuration for RAG system
 */

export const RAG_CONFIG = {
  // Qdrant Configuration
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collectionName: 'shopify_products',
    kbCollectionName: 'shopify_knowledge_base',
    vectorSize: 1536, // OpenAI text-embedding-3-small dimension
  },

  // OpenAI Embeddings Configuration
  embeddings: {
    model: 'text-embedding-3-small',
    batchSize: 100, // Process 100 products at a time
    dimension: 1536,
    costPer1MTokens: 0.02, // $0.02 per 1M tokens
  },

  // Search Configuration
  search: {
    topK: 10, // Return top 10 most relevant products
    minScore: 0.3, // Minimum similarity score (0-1) - lowered for better recall
    hybridAlpha: 0.5, // Balance between semantic (1.0) and keyword (0.0)
  },

  // Sync Configuration
  sync: {
    cronSchedule: '0 2 * * *', // Run at 2 AM daily
    webhookBatchDelay: 5000, // Wait 5s to batch multiple webhook updates
    maxRetries: 3,
  },

  // Chunking Strategy
  chunking: {
    maxChunkSize: 512, // Max tokens per chunk
    overlap: 50, // Overlap between chunks
  },
};

export default RAG_CONFIG;
