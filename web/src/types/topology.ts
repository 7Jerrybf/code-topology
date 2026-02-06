/**
 * Topology data types (mirrored from CLI)
 */

export type NodeType = 'FILE' | 'COMPONENT' | 'UTILITY';
export type DiffStatus = 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'DELETED';
export type Language = 'typescript' | 'javascript' | 'python';

export interface TopologyNode {
  id: string;
  label: string;
  type: NodeType;
  status: DiffStatus;
  astSignature: string;
  /** Programming language of the file */
  language?: Language;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  isBroken: boolean;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
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
