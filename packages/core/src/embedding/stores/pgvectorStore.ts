/**
 * pgvector-backed VectorStore adapter
 * Dynamically imports `pg` — no hard dependency
 */

import type { PgvectorConfig } from '@topology/protocol';
import type { VectorStore, VectorRecord, SimilarResult, VectorRecordMetadata } from '../vectorStore.js';

const EMBEDDING_DIM = 384;

export class PgvectorStore implements VectorStore {
  private pool: any = null;
  private readonly config: PgvectorConfig;
  private readonly tableName: string;
  private readonly namespace: string;

  constructor(config: PgvectorConfig) {
    this.config = config;
    this.tableName = config.tableName ?? 'topology_embeddings';
    this.namespace = config.namespace ?? 'default';
  }

  async init(): Promise<void> {
    let Pool: any;
    try {
      // Dynamic import — optional peer dependency
      const mod = await (Function('return import("pg")')() as Promise<any>);
      Pool = mod.default?.Pool ?? mod.Pool;
    } catch {
      throw new Error('pg not installed. Run: pnpm add pg');
    }

    this.pool = new Pool({ connectionString: this.config.connectionString });

    // Ensure pgvector extension + table
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id         TEXT    NOT NULL,
          namespace  TEXT    NOT NULL DEFAULT 'default',
          embedding  vector(${EMBEDDING_DIM}) NOT NULL,
          content_hash TEXT  NOT NULL,
          model_id   TEXT    NOT NULL,
          repo_id    TEXT,
          language   TEXT,
          updated_at BIGINT  NOT NULL,
          PRIMARY KEY (id, namespace)
        )
      `);
      // Create IVFFlat index if not exists (cosine distance)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_embedding
        ON ${this.tableName}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
    } finally {
      client.release();
    }
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (!this.pool || records.length === 0) return;

    const client = await this.pool.connect();
    try {
      // Use a single transaction for batch upsert
      await client.query('BEGIN');
      const sql = `
        INSERT INTO ${this.tableName}
          (id, namespace, embedding, content_hash, model_id, repo_id, language, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id, namespace) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          content_hash = EXCLUDED.content_hash,
          model_id = EXCLUDED.model_id,
          repo_id = EXCLUDED.repo_id,
          language = EXCLUDED.language,
          updated_at = EXCLUDED.updated_at
      `;

      for (const r of records) {
        const embStr = `[${r.embedding.join(',')}]`;
        await client.query(sql, [
          r.id,
          this.namespace,
          embStr,
          r.metadata.contentHash,
          r.metadata.modelId,
          r.metadata.repoId ?? null,
          r.metadata.language ?? null,
          r.metadata.updatedAt,
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.pool || ids.length === 0) return;

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE namespace = $1 AND id IN (${placeholders})`,
      [this.namespace, ...ids],
    );
  }

  async query(
    vector: number[],
    topK: number,
    filter?: { namespace?: string },
  ): Promise<SimilarResult[]> {
    if (!this.pool) return [];

    const embStr = `[${vector.join(',')}]`;
    const ns = filter?.namespace;

    // If namespace is explicitly undefined, search all namespaces (cross-repo)
    const nsClause = ns === undefined
      ? `WHERE namespace = $2`
      : ns
        ? `WHERE namespace = $2`
        : '';

    const nsParam = ns === undefined ? this.namespace : ns || null;

    let sql: string;
    let params: any[];

    if (nsClause) {
      sql = `
        SELECT id, 1 - (embedding <=> $1::vector) AS score,
               content_hash, model_id, repo_id, language, updated_at
        FROM ${this.tableName}
        ${nsClause}
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `;
      params = [embStr, nsParam, topK];
    } else {
      sql = `
        SELECT id, 1 - (embedding <=> $1::vector) AS score,
               content_hash, model_id, repo_id, language, updated_at
        FROM ${this.tableName}
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `;
      params = [embStr, topK];
    }

    const result = await this.pool.query(sql, params);

    return result.rows.map((row: any) => ({
      id: row.id as string,
      score: parseFloat(row.score),
      metadata: {
        contentHash: row.content_hash as string,
        modelId: row.model_id as string,
        repoId: (row.repo_id as string) || undefined,
        language: (row.language as string) || undefined,
        updatedAt: parseInt(row.updated_at, 10),
      } as VectorRecordMetadata,
    }));
  }

  async fetch(ids: string[]): Promise<VectorRecord[]> {
    if (!this.pool || ids.length === 0) return [];

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const result = await this.pool.query(
      `SELECT id, embedding::text, content_hash, model_id, repo_id, language, updated_at
       FROM ${this.tableName}
       WHERE namespace = $1 AND id IN (${placeholders})`,
      [this.namespace, ...ids],
    );

    return result.rows.map((row: any) => {
      // Parse vector text format "[0.1,0.2,...]"
      const embStr = (row.embedding as string).replace(/[\[\]]/g, '');
      const embedding = embStr.split(',').map(Number);

      return {
        id: row.id as string,
        embedding,
        metadata: {
          contentHash: row.content_hash as string,
          modelId: row.model_id as string,
          repoId: (row.repo_id as string) || undefined,
          language: (row.language as string) || undefined,
          updatedAt: parseInt(row.updated_at, 10),
        } as VectorRecordMetadata,
      };
    });
  }

  async prune(existingIds: Set<string>): Promise<number> {
    if (!this.pool) return 0;

    // Get all IDs in current namespace
    const result = await this.pool.query(
      `SELECT id FROM ${this.tableName} WHERE namespace = $1`,
      [this.namespace],
    );

    const toDelete: string[] = [];
    for (const row of result.rows) {
      if (!existingIds.has(row.id)) {
        toDelete.push(row.id);
      }
    }

    if (toDelete.length > 0) {
      await this.delete(toDelete);
    }
    return toDelete.length;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
