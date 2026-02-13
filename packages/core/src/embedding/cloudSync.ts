/**
 * Cloud vector sync — write-through from local cache to cloud store
 * Only syncs newly generated embeddings (cache misses)
 */

import type { VectorStore, VectorRecord } from './vectorStore.js';

export interface CloudSyncResult {
  upserted: number;
  pruned: number;
  durationMs: number;
}

/**
 * Sync new embeddings to a cloud vector store and prune deleted files.
 *
 * @param store - Cloud VectorStore (Pinecone or pgvector)
 * @param newRecords - Only the newly generated embeddings (cache misses)
 * @param existingFileIds - Set of all current file IDs in the repo
 * @param batchSize - Max records per upsert batch
 */
export async function syncToCloud(
  store: VectorStore,
  newRecords: VectorRecord[],
  existingFileIds: Set<string>,
  batchSize: number = 100,
): Promise<CloudSyncResult> {
  const start = Date.now();
  let upserted = 0;

  // Upsert in batches
  for (let i = 0; i < newRecords.length; i += batchSize) {
    const batch = newRecords.slice(i, i + batchSize);
    await store.upsert(batch);
    upserted += batch.length;
  }

  // Prune deleted files
  const pruned = await store.prune(existingFileIds);

  return {
    upserted,
    pruned,
    durationMs: Date.now() - start,
  };
}
