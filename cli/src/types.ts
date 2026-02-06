/**
 * Core data structures for code topology analysis
 * Shared between CLI and Web
 */

/** Supported programming languages */
export type Language = 'typescript' | 'javascript' | 'python';

/** Node types in the topology graph */
export type NodeType = 'FILE' | 'COMPONENT' | 'UTILITY';

/** Change status based on Git diff */
export type DiffStatus = 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'DELETED';

/** A node representing a file or module in the codebase */
export interface TopologyNode {
  /** Unique identifier - file path (e.g., "src/utils/auth.ts") */
  id: string;
  /** Display name (e.g., "auth.ts") */
  label: string;
  /** Type of the node */
  type: NodeType;
  /** Git diff status - used for coloring (green/yellow/red) */
  status: DiffStatus;
  /** Hash/signature for detecting content changes */
  astSignature: string;
  /** Programming language of the file */
  language?: Language;
}

/** An edge representing a dependency between two nodes */
export interface TopologyEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node ID (importer) */
  source: string;
  /** Target node ID (exporter) */
  target: string;
  /** True if target changed signature but source didn't update */
  isBroken: boolean;
}

/** The complete topology graph data structure */
export interface TopologyGraph {
  /** All nodes in the graph */
  nodes: TopologyNode[];
  /** All edges (dependencies) in the graph */
  edges: TopologyEdge[];
  /** Unix timestamp when the graph was generated */
  timestamp: number;
}

// ============================================
// Phase 5: Time Travel - Snapshot Types
// ============================================

/** Metadata for a topology snapshot */
export interface SnapshotMetadata {
  /** Unix timestamp when the snapshot was created */
  timestamp: number;
  /** Git commit hash (short) */
  commitHash: string | null;
  /** Git commit message (first line) */
  commitMessage: string | null;
  /** Git branch name */
  branch: string | null;
  /** User-provided label for the snapshot */
  label: string | null;
  /** Number of nodes in the graph */
  nodeCount: number;
  /** Number of edges in the graph */
  edgeCount: number;
  /** Number of changed nodes (ADDED, MODIFIED, DELETED) */
  changedCount: number;
  /** Number of broken edges */
  brokenCount: number;
}

/** A snapshot containing metadata and graph data */
export interface TopologySnapshot {
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
  /** The topology graph at this point in time */
  graph: TopologyGraph;
}

/** Version 2 data file format with snapshot history */
export interface TopologyDataFile {
  /** File format version */
  version: 2;
  /** Index of the currently selected snapshot */
  currentIndex: number;
  /** Array of snapshots (newest last) */
  snapshots: TopologySnapshot[];
}
