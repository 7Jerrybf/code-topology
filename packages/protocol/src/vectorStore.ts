/**
 * Vector Store configuration schemas
 * Defines provider types and connection settings for cloud vector DBs
 */

import { z } from 'zod';

export const VectorProviderSchema = z.enum(['sqlite', 'pinecone', 'pgvector']);
export type VectorProvider = z.infer<typeof VectorProviderSchema>;

export const PineconeConfigSchema = z.object({
  apiKey: z.string().min(1),
  indexName: z.string().min(1),
  namespace: z.string().optional(),
});
export type PineconeConfig = z.infer<typeof PineconeConfigSchema>;

export const PgvectorConfigSchema = z.object({
  connectionString: z.string().min(1),
  tableName: z.string().default('topology_embeddings'),
  namespace: z.string().optional(),
});
export type PgvectorConfig = z.infer<typeof PgvectorConfigSchema>;

export const VectorSyncConfigSchema = z.object({
  enabled: z.boolean().default(true),
  batchSize: z.number().int().min(1).max(1000).default(100),
  useCloudSearch: z.boolean().default(false),
});
export type VectorSyncConfig = z.infer<typeof VectorSyncConfigSchema>;

export const VectorStoreConfigSchema = z.object({
  provider: VectorProviderSchema.default('sqlite'),
  pinecone: PineconeConfigSchema.optional(),
  pgvector: PgvectorConfigSchema.optional(),
  sync: VectorSyncConfigSchema.default({}),
});
export type VectorStoreConfig = z.infer<typeof VectorStoreConfigSchema>;
