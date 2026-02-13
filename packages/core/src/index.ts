/**
 * @topology/core - Core engine for code topology analysis
 *
 * This package provides the foundational functionality for analyzing codebases:
 * - Multi-language AST parsing (TypeScript, JavaScript, Python)
 * - Dependency graph construction
 * - Git diff integration
 * - Report generation
 *
 * @packageDocumentation
 */

// High-level API
export {
  analyzeDirectory,
  type AnalyzeOptions,
} from './analyze.js';

// Parser module
export {
  parseFile,
  parseContentForExports,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedFile,
  type ParsedImport,
} from './parser/index.js';

// Git module
export {
  getGitDiff,
  getFileAtRef,
  getCurrentCommitInfo,
  type GitDiffResult,
  type CommitInfo,
} from './git/index.js';

// Graph module
export {
  buildGraph,
  createSnapshot,
  loadExistingData,
  saveTopologyData,
  type HistoryOptions,
} from './graph/index.js';

// Reporter module
export {
  generateReport,
  type ReportFormat,
  type ReportOptions,
  type ReportSummary,
  type BrokenDependencyInfo,
  type JsonReport,
} from './reporter/index.js';

// Plugin system
export {
  pluginRegistry,
  type LanguagePlugin,
} from './plugins/index.js';

// Cache module
export {
  CacheDb,
  ParseCache,
  simpleHash,
  type CacheStats,
} from './cache/index.js';

// Embedding module
export {
  Embedder,
  EmbeddingCache,
  ModelManager,
  cosineSimilarity,
  findSemanticEdges,
  type SemanticEdge,
  // Vector store abstractions (Phase 4: Cloud Vector DB)
  type VectorStore,
  type VectorRecord,
  type SimilarResult,
  type VectorRecordMetadata,
  createVectorStore,
  resolveVectorConfig,
  type VectorConfigOverrides,
  syncToCloud,
  type CloudSyncResult,
  findSemanticEdgesCloud,
  type CloudSearchOptions,
} from './embedding/index.js';

// Conflict detection module
export {
  detectConflicts,
  listOtherBranches,
  getBranchModifiedFiles,
  type DetectConflictsOptions,
} from './conflict/index.js';

// Auth module
export {
  AuthDb,
  UserManager,
  ApiKeyManager,
  JwtManager,
  resolveAuthContext,
  createLocalAdminContext,
  hasPermission,
  getPermissionsForRole,
  ROLE_PERMISSIONS,
} from './auth/index.js';
export type { UserRow, ApiKeyRow, CreateKeyResult, ResolveAuthOptions } from './auth/index.js';

// Audit module
export {
  AuditLogger,
  enforceRetention,
} from './audit/index.js';
export type { AuditLogInput } from './audit/index.js';

// Re-export protocol types for convenience
export type {
  Language,
  LinkType,
  NodeType,
  DiffStatus,
  TopologyNode,
  TopologyEdge,
  TopologyGraph,
  SnapshotMetadata,
  TopologySnapshot,
  TopologyDataFile,
  ConflictType,
  ConflictSeverity,
  ConflictWarning,
  VectorProvider,
  VectorStoreConfig,
  VectorSyncConfig,
} from '@topology/protocol';
