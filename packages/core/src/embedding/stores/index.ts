/**
 * VectorStore factory — creates the appropriate adapter based on config
 */

import type { VectorStoreConfig } from '@topology/protocol';
import type { VectorStore } from '../vectorStore.js';
import type { CacheDb } from '../../cache/db.js';
import { SqliteVectorStore } from './sqliteStore.js';

export async function createVectorStore(
  config: VectorStoreConfig,
  cacheDb?: CacheDb,
): Promise<VectorStore> {
  switch (config.provider) {
    case 'pinecone': {
      const { PineconeVectorStore } = await import('./pineconeStore.js');
      if (!config.pinecone) {
        throw new Error('Pinecone config (apiKey, indexName) is required when provider=pinecone');
      }
      const store = new PineconeVectorStore(config.pinecone);
      await store.init();
      return store;
    }

    case 'pgvector': {
      const { PgvectorStore } = await import('./pgvectorStore.js');
      if (!config.pgvector) {
        throw new Error('pgvector config (connectionString) is required when provider=pgvector');
      }
      const store = new PgvectorStore(config.pgvector);
      await store.init();
      return store;
    }

    case 'sqlite':
    default: {
      if (!cacheDb) {
        throw new Error('CacheDb is required for SQLite vector store');
      }
      const store = new SqliteVectorStore(cacheDb);
      await store.init();
      return store;
    }
  }
}
