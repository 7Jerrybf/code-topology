/**
 * @topology/protocol - Shared type definitions and Zod schemas
 * Single Source of Truth for all data contracts
 */

// Topology types (core graph structures)
export {
  // Schemas
  LanguageSchema,
  LinkTypeSchema,
  NodeTypeSchema,
  DiffStatusSchema,
  NodeKindSchema,
  NodeStatusSchema,
  TopologyNodeSchema,
  TopologyEdgeSchema,
  TopologyGraphSchema,
  SnapshotMetadataSchema,
  TopologySnapshotSchema,
  TopologyDataFileSchema,
  // Types
  type Language,
  type LinkType,
  type NodeType,
  type DiffStatus,
  type NodeKind,
  type NodeStatus,
  type TopologyNode,
  type TopologyEdge,
  type TopologyGraph,
  type SnapshotMetadata,
  type TopologySnapshot,
  type TopologyDataFile,
} from './topology.js';

// Explain types (AI feature)
export {
  ExplainRequestSchema,
  ExplainResultSchema,
  ExplainErrorCodeSchema,
  ExplainErrorSchema,
  type ExplainRequest,
  type ExplainResult,
  type ExplainErrorCode,
  type ExplainError,
} from './explain.js';

// WebSocket types
export {
  WsMessageTypeSchema,
  WsMessageSchema,
  GitEventTypeSchema,
  GitEventSchema,
  type WsMessageType,
  type WsMessage,
  type GitEventType,
  type GitEvent,
} from './websocket.js';

// Intent types (Phase 3 preparation)
export {
  IntentSchema,
  ArbitrationRequestSchema,
  type Intent,
  type ArbitrationRequest,
} from './intent.js';

// Conflict Warning types (Phase 3: cross-branch semantic conflict detection)
export {
  ConflictTypeSchema,
  ConflictSeveritySchema,
  ConflictWarningSchema,
  type ConflictType,
  type ConflictSeverity,
  type ConflictWarning,
} from './conflict.js';

// Auth types (Phase 4: RBAC)
export {
  RoleSchema,
  PermissionSchema,
  UserSchema,
  ApiKeySchema,
  AuthContextSchema,
  AuthConfigSchema,
  type Role,
  type Permission,
  type User,
  type ApiKey,
  type AuthContext,
  type AuthConfig,
} from './auth.js';

// Audit types (Phase 4: Audit Logging)
export {
  AuditActionSchema,
  AuditSeveritySchema,
  AuditLogEntrySchema,
  AuditQuerySchema,
  AuditRetentionSchema,
  type AuditAction,
  type AuditSeverity,
  type AuditLogEntry,
  type AuditQuery,
  type AuditRetention,
} from './audit.js';

// Vector Store types (Phase 4: Cloud Vector DB)
export {
  VectorProviderSchema,
  PineconeConfigSchema,
  PgvectorConfigSchema,
  VectorSyncConfigSchema,
  VectorStoreConfigSchema,
  type VectorProvider,
  type PineconeConfig,
  type PgvectorConfig,
  type VectorSyncConfig,
  type VectorStoreConfig,
} from './vectorStore.js';
