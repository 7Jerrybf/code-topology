/**
 * Core data structures for code topology analysis
 * Shared between CLI and Web
 */

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
