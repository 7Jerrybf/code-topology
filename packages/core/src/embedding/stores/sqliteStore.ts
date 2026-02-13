/**
 * SQLite-backed VectorStore adapter
 * Wraps existing EmbeddingCache + brute-force cosine similarity search
 */

import type { VectorStore, VectorRecord, SimilarResult } from '../vectorStore.js';
import type { CacheDb } from '../../cache/db.js';
import { EmbeddingCache } from '../embeddingCache.js';
import { cosineSimilarity } from '../similarity.js';

export class SqliteVectorStore implements VectorStore {
  private cache: EmbeddingCache | null = null;
  private readonly cacheDb: CacheDb;

  constructor(cacheDb: CacheDb) {
    this.cacheDb = cacheDb;
  }

  async init(): Promise<void> {
    this.cache = new EmbeddingCache(this.cacheDb);
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (!this.cache) return;
    this.cache.setBatch(
      records.map((r) => ({
        filePath: r.id,
        contentHash: r.metadata.contentHash,
        embedding: r.embedding,
        modelId: r.metadata.modelId,
      })),
    );
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.cache) return;
    const db = this.cacheDb.database;
    const stmt = db.prepare('DELETE FROM embeddings WHERE file_path = ?');
    const tx = db.transaction((batch: string[]) => {
      for (const id of batch) stmt.run(id);
    });
    tx(ids);
  }

  async query(
    vector: number[],
    topK: number,
    _filter?: { namespace?: string },
  ): Promise<SimilarResult[]> {
    if (!this.cache) return [];

    const db = this.cacheDb.database;
    const rows = db
      .prepare('SELECT file_path, embedding_json, content_hash, model_id, cached_at FROM embeddings')
      .all() as Array<{
        file_path: string;
        embedding_json: string;
        content_hash: string;
        model_id: string;
        cached_at: number;
      }>;

    const scored: SimilarResult[] = [];
    for (const row of rows) {
      const emb = JSON.parse(row.embedding_json) as number[];
      const score = cosineSimilarity(vector, emb);
      scored.push({
        id: row.file_path,
        score,
        metadata: {
          contentHash: row.content_hash,
          modelId: row.model_id,
          updatedAt: row.cached_at,
        },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async fetch(ids: string[]): Promise<VectorRecord[]> {
    if (!this.cache) return [];

    const db = this.cacheDb.database;
    const stmt = db.prepare(
      'SELECT file_path, embedding_json, content_hash, model_id, cached_at FROM embeddings WHERE file_path = ?',
    );
    const results: VectorRecord[] = [];

    for (const id of ids) {
      const row = stmt.get(id) as
        | { file_path: string; embedding_json: string; content_hash: string; model_id: string; cached_at: number }
        | undefined;
      if (row) {
        results.push({
          id: row.file_path,
          embedding: JSON.parse(row.embedding_json) as number[],
          metadata: {
            contentHash: row.content_hash,
            modelId: row.model_id,
            updatedAt: row.cached_at,
          },
        });
      }
    }
    return results;
  }

  async prune(existingIds: Set<string>): Promise<number> {
    if (!this.cache) return 0;
    return this.cache.prune(existingIds);
  }

  async close(): Promise<void> {
    // SQLite lifecycle is managed by CacheDb — nothing to do here
  }
}
