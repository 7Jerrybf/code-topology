/**
 * Embedding cache using SQLite
 * Stores vector embeddings keyed by file path with content hash validation
 */

import type Database from 'better-sqlite3';
import type { CacheDb } from '../cache/db.js';

interface EmbeddingRow {
  file_path: string;
  content_hash: string;
  embedding_json: string;
  model_id: string;
  cached_at: number;
}

export class EmbeddingCache {
  private readonly db: Database.Database;
  private readonly stmtGet: Database.Statement;
  private readonly stmtUpsert: Database.Statement;
  private readonly stmtDelete: Database.Statement;

  constructor(cacheDb: CacheDb) {
    this.db = cacheDb.database;

    this.stmtGet = this.db.prepare(
      'SELECT * FROM embeddings WHERE file_path = ? AND content_hash = ?'
    );

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO embeddings (file_path, content_hash, embedding_json, model_id, cached_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        embedding_json = excluded.embedding_json,
        model_id = excluded.model_id,
        cached_at = excluded.cached_at
    `);

    this.stmtDelete = this.db.prepare('DELETE FROM embeddings WHERE file_path = ?');
  }

  get(filePath: string, contentHash: string): number[] | null {
    const row = this.stmtGet.get(filePath, contentHash) as EmbeddingRow | undefined;
    if (!row) return null;
    return JSON.parse(row.embedding_json) as number[];
  }

  set(filePath: string, contentHash: string, embedding: number[], modelId: string): void {
    this.stmtUpsert.run(
      filePath,
      contentHash,
      JSON.stringify(embedding),
      modelId,
      Date.now(),
    );
  }

  setBatch(items: { filePath: string; contentHash: string; embedding: number[]; modelId: string }[]): void {
    const transaction = this.db.transaction((batch: typeof items) => {
      for (const item of batch) {
        this.stmtUpsert.run(
          item.filePath,
          item.contentHash,
          JSON.stringify(item.embedding),
          item.modelId,
          Date.now(),
        );
      }
    });
    transaction(items);
  }

  prune(existingFiles: Set<string>): number {
    const allRows = this.db.prepare('SELECT file_path FROM embeddings').all() as { file_path: string }[];
    let pruned = 0;
    const transaction = this.db.transaction(() => {
      for (const row of allRows) {
        if (!existingFiles.has(row.file_path)) {
          this.stmtDelete.run(row.file_path);
          pruned++;
        }
      }
    });
    transaction();
    return pruned;
  }
}
