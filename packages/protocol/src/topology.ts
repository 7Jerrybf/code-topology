/**
 * Core topology data structures (Zod schemas + inferred types)
 * Single Source of Truth for all topology-related types
 */

import { z } from 'zod';

// ============================================
// Enums / Literals
// ============================================

export const LanguageSchema = z.enum(['typescript', 'javascript', 'python']);
export type Language = z.infer<typeof LanguageSchema>;

export const NodeTypeSchema = z.enum(['FILE', 'COMPONENT', 'UTILITY']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const DiffStatusSchema = z.enum(['UNCHANGED', 'ADDED', 'MODIFIED', 'DELETED']);
export type DiffStatus = z.infer<typeof DiffStatusSchema>;

/** Node kinds from CLAUDE.md spec (superset, for future use) */
export const NodeKindSchema = z.enum(['FILE', 'MODULE', 'CLASS', 'FUNCTION', 'INTERFACE']);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/** Node status from CLAUDE.md spec (for future use) */
export const NodeStatusSchema = z.enum(['STABLE', 'DRAFT', 'CONFLICT', 'DEPRECATED']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

// ============================================
// Core Graph Schemas
// ============================================

export const TopologyNodeSchema = z.object({
  /** Unique identifier - file path (e.g., "src/utils/auth.ts") */
  id: z.string(),
  /** Display name (e.g., "auth.ts") */
  label: z.string(),
  /** Type of the node */
  type: NodeTypeSchema,
  /** Git diff status - used for coloring (green/yellow/red) */
  status: DiffStatusSchema,
  /** Hash/signature for detecting content changes */
  astSignature: z.string(),
  /** Programming language of the file */
  language: LanguageSchema.optional(),
});
export type TopologyNode = z.infer<typeof TopologyNodeSchema>;

export const TopologyEdgeSchema = z.object({
  /** Unique identifier for the edge */
  id: z.string(),
  /** Source node ID (importer) */
  source: z.string(),
  /** Target node ID (exporter) */
  target: z.string(),
  /** True if target changed signature but source didn't update */
  isBroken: z.boolean(),
});
export type TopologyEdge = z.infer<typeof TopologyEdgeSchema>;

export const TopologyGraphSchema = z.object({
  /** All nodes in the graph */
  nodes: z.array(TopologyNodeSchema),
  /** All edges (dependencies) in the graph */
  edges: z.array(TopologyEdgeSchema),
  /** Unix timestamp when the graph was generated */
  timestamp: z.number(),
});
export type TopologyGraph = z.infer<typeof TopologyGraphSchema>;

// ============================================
// Snapshot Schemas (Time Travel)
// ============================================

export const SnapshotMetadataSchema = z.object({
  /** Unix timestamp when the snapshot was created */
  timestamp: z.number(),
  /** Git commit hash (short) */
  commitHash: z.string().nullable(),
  /** Git commit message (first line) */
  commitMessage: z.string().nullable(),
  /** Git branch name */
  branch: z.string().nullable(),
  /** User-provided label for the snapshot */
  label: z.string().nullable(),
  /** Number of nodes in the graph */
  nodeCount: z.number(),
  /** Number of edges in the graph */
  edgeCount: z.number(),
  /** Number of changed nodes (ADDED, MODIFIED, DELETED) */
  changedCount: z.number(),
  /** Number of broken edges */
  brokenCount: z.number(),
});
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;

export const TopologySnapshotSchema = z.object({
  /** Snapshot metadata */
  metadata: SnapshotMetadataSchema,
  /** The topology graph at this point in time */
  graph: TopologyGraphSchema,
});
export type TopologySnapshot = z.infer<typeof TopologySnapshotSchema>;

export const TopologyDataFileSchema = z.object({
  /** File format version */
  version: z.literal(2),
  /** Index of the currently selected snapshot */
  currentIndex: z.number(),
  /** Array of snapshots (newest last) */
  snapshots: z.array(TopologySnapshotSchema),
});
export type TopologyDataFile = z.infer<typeof TopologyDataFileSchema>;
