/**
 * Embedding module - Local vector embedding generation and semantic similarity
 * @module @topology/core/embedding
 */

export { Embedder } from './embedder.js';
export { EmbeddingCache } from './embeddingCache.js';
export { ModelManager } from './modelManager.js';
export { BertTokenizer, type TokenizerOutput } from './tokenizer.js';
export { cosineSimilarity, findSemanticEdges, type SemanticEdge } from './similarity.js';

// Vector store abstractions
export type { VectorStore, VectorRecord, SimilarResult, VectorRecordMetadata } from './vectorStore.js';
export { createVectorStore } from './stores/index.js';
export { resolveVectorConfig, type VectorConfigOverrides } from './vectorConfig.js';
export { syncToCloud, type CloudSyncResult } from './cloudSync.js';
export { findSemanticEdgesCloud, type CloudSearchOptions } from './cloudSearch.js';
