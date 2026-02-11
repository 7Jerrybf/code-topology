/**
 * Embedding module - Local vector embedding generation and semantic similarity
 * @module @topology/core/embedding
 */

export { Embedder } from './embedder.js';
export { EmbeddingCache } from './embeddingCache.js';
export { ModelManager } from './modelManager.js';
export { BertTokenizer, type TokenizerOutput } from './tokenizer.js';
export { cosineSimilarity, findSemanticEdges, type SemanticEdge } from './similarity.js';
