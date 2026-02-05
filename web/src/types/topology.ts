/**
 * Topology data types (mirrored from CLI)
 */

export type NodeType = 'FILE' | 'COMPONENT' | 'UTILITY';
export type DiffStatus = 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'DELETED';

export interface TopologyNode {
  id: string;
  label: string;
  type: NodeType;
  status: DiffStatus;
  astSignature: string;
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
