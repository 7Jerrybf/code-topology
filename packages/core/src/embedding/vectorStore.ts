/**
 * VectorStore interface — abstract contract for all vector storage backends
 */

export interface VectorRecordMetadata {
  contentHash: string;
  modelId: string;
  repoId?: string;
  language?: string;
  updatedAt: number;
}

export interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: VectorRecordMetadata;
}

export interface SimilarResult {
  id: string;
  score: number;
  metadata?: VectorRecordMetadata;
}

export interface VectorStore {
  /** Initialize the store (create tables, connect, etc.) */
  init(): Promise<void>;

  /** Upsert embedding records */
  upsert(records: VectorRecord[]): Promise<void>;

  /** Delete records by IDs */
  delete(ids: string[]): Promise<void>;

  /** Query for nearest neighbors */
  query(
    vector: number[],
    topK: number,
    filter?: { namespace?: string },
  ): Promise<SimilarResult[]>;

  /** Fetch records by IDs */
  fetch(ids: string[]): Promise<VectorRecord[]>;

  /** Remove records whose IDs are NOT in the provided set */
  prune(existingIds: Set<string>): Promise<number>;

  /** Close connection / release resources */
  close(): Promise<void>;
}
