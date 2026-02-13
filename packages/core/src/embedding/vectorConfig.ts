/**
 * Resolve VectorStoreConfig from environment variables + overrides
 */

import { VectorStoreConfigSchema, type VectorStoreConfig, type VectorProvider } from '@topology/protocol';

export interface VectorConfigOverrides {
  provider?: VectorProvider;
  pinecone?: {
    apiKey: string;
    indexName: string;
    namespace?: string;
  };
  pgvector?: {
    connectionString: string;
    tableName?: string;
    namespace?: string;
  };
  sync?: {
    enabled?: boolean;
    batchSize?: number;
    useCloudSearch?: boolean;
  };
}

export function resolveVectorConfig(
  overrides?: VectorConfigOverrides,
): VectorStoreConfig {
  const env = process.env;

  const raw: Record<string, unknown> = {
    provider: overrides?.provider ?? env.TOPOLOGY_VECTOR_PROVIDER ?? 'sqlite',
    sync: {
      enabled:
        overrides?.sync?.enabled ??
        (env.TOPOLOGY_VECTOR_SYNC !== undefined
          ? env.TOPOLOGY_VECTOR_SYNC !== 'false'
          : true),
      batchSize:
        overrides?.sync?.batchSize ??
        (env.TOPOLOGY_VECTOR_BATCH_SIZE
          ? parseInt(env.TOPOLOGY_VECTOR_BATCH_SIZE, 10)
          : 100),
      useCloudSearch:
        overrides?.sync?.useCloudSearch ??
        (env.TOPOLOGY_VECTOR_CLOUD_SEARCH !== undefined
          ? env.TOPOLOGY_VECTOR_CLOUD_SEARCH !== 'false'
          : false),
    },
  };

  // Pinecone config
  const pineconeApiKey = overrides?.pinecone?.apiKey ?? env.TOPOLOGY_PINECONE_API_KEY;
  const pineconeIndex = overrides?.pinecone?.indexName ?? env.TOPOLOGY_PINECONE_INDEX;
  if (pineconeApiKey && pineconeIndex) {
    raw.pinecone = {
      apiKey: pineconeApiKey,
      indexName: pineconeIndex,
      namespace: overrides?.pinecone?.namespace ?? env.TOPOLOGY_PINECONE_NAMESPACE,
    };
  }

  // pgvector config
  const pgvectorUrl = overrides?.pgvector?.connectionString ?? env.TOPOLOGY_PGVECTOR_URL;
  if (pgvectorUrl) {
    raw.pgvector = {
      connectionString: pgvectorUrl,
      tableName:
        overrides?.pgvector?.tableName ?? env.TOPOLOGY_PGVECTOR_TABLE ?? 'topology_embeddings',
      namespace: overrides?.pgvector?.namespace ?? env.TOPOLOGY_PGVECTOR_NAMESPACE,
    };
  }

  return VectorStoreConfigSchema.parse(raw);
}
