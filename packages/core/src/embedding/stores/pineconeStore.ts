/**
 * Pinecone-backed VectorStore adapter
 * Dynamically imports @pinecone-database/pinecone — no hard dependency
 */

import type { PineconeConfig } from '@topology/protocol';
import type { VectorStore, VectorRecord, SimilarResult, VectorRecordMetadata } from '../vectorStore.js';

const PINECONE_BATCH_SIZE = 100;

export class PineconeVectorStore implements VectorStore {
  private index: any = null;
  private ns: any = null;
  private readonly config: PineconeConfig;

  constructor(config: PineconeConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    let Pinecone: any;
    try {
      // Dynamic import — optional peer dependency
      const mod = await (Function('return import("@pinecone-database/pinecone")')() as Promise<any>);
      Pinecone = mod.Pinecone;
    } catch {
      throw new Error(
        'Pinecone SDK not installed. Run: pnpm add @pinecone-database/pinecone',
      );
    }

    const client = new Pinecone({ apiKey: this.config.apiKey });
    this.index = client.index(this.config.indexName);
    this.ns = this.config.namespace
      ? this.index.namespace(this.config.namespace)
      : this.index;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (!this.ns) return;

    // Pinecone max 100 vectors per upsert request
    for (let i = 0; i < records.length; i += PINECONE_BATCH_SIZE) {
      const batch = records.slice(i, i + PINECONE_BATCH_SIZE);
      const vectors = batch.map((r) => ({
        id: r.id,
        values: r.embedding,
        metadata: {
          contentHash: r.metadata.contentHash,
          modelId: r.metadata.modelId,
          repoId: r.metadata.repoId ?? '',
          language: r.metadata.language ?? '',
          updatedAt: r.metadata.updatedAt,
        },
      }));
      await this.ns.upsert(vectors);
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.ns || ids.length === 0) return;
    // Pinecone supports batch delete by IDs
    await this.ns.deleteMany(ids);
  }

  async query(
    vector: number[],
    topK: number,
    filter?: { namespace?: string },
  ): Promise<SimilarResult[]> {
    if (!this.index) return [];

    // For cross-repo queries, use the base index (no namespace filter)
    const target = filter?.namespace === undefined
      ? this.ns
      : filter.namespace
        ? this.index.namespace(filter.namespace)
        : this.index;

    const result = await target.query({
      vector,
      topK,
      includeMetadata: true,
    });

    return (result.matches ?? []).map((m: any) => ({
      id: m.id as string,
      score: m.score as number,
      metadata: m.metadata
        ? {
            contentHash: m.metadata.contentHash as string,
            modelId: m.metadata.modelId as string,
            repoId: (m.metadata.repoId as string) || undefined,
            language: (m.metadata.language as string) || undefined,
            updatedAt: m.metadata.updatedAt as number,
          }
        : undefined,
    }));
  }

  async fetch(ids: string[]): Promise<VectorRecord[]> {
    if (!this.ns || ids.length === 0) return [];

    const result = await this.ns.fetch(ids);
    const records: VectorRecord[] = [];

    for (const [id, vec] of Object.entries(result.records ?? {})) {
      const v = vec as any;
      records.push({
        id,
        embedding: v.values as number[],
        metadata: {
          contentHash: (v.metadata?.contentHash as string) ?? '',
          modelId: (v.metadata?.modelId as string) ?? '',
          repoId: (v.metadata?.repoId as string) || undefined,
          language: (v.metadata?.language as string) || undefined,
          updatedAt: (v.metadata?.updatedAt as number) ?? 0,
        } as VectorRecordMetadata,
      });
    }
    return records;
  }

  async prune(_existingIds: Set<string>): Promise<number> {
    // Pinecone doesn't support listing all IDs efficiently in all plans.
    // For serverless indexes, we skip auto-prune and rely on upsert idempotency.
    // Users should use delete() explicitly for cleanup.
    return 0;
  }

  async close(): Promise<void> {
    // Pinecone client is stateless HTTP — nothing to close
    this.index = null;
    this.ns = null;
  }
}
