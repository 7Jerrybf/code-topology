'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import { TopologyNode, type TopologyNodeData } from './TopologyNode';
import type { TopologyGraph as TopologyGraphData } from '@/types/topology';

// Register custom node types
const nodeTypes: NodeTypes = {
  topology: TopologyNode,
};

// Dagre layout configuration
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

interface TopologyGraphProps {
  data: TopologyGraphData | null;
  onNodeClick?: (nodeId: string) => void;
}

export function TopologyGraph({ data, onNodeClick }: TopologyGraphProps) {
  const { nodes, edges } = useMemo(() => {
    if (!data) {
      return { nodes: [], edges: [] };
    }

    const rawNodes: Node[] = data.nodes.map((node) => ({
      id: node.id,
      type: 'topology',
      position: { x: 0, y: 0 },
      data: {
        label: node.label,
        type: node.type,
        status: node.status,
        fullPath: node.id,
      } satisfies TopologyNodeData,
    }));

    const rawEdges: Edge[] = data.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: edge.isBroken,
      style: edge.isBroken
        ? { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5,5' }
        : { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.isBroken ? '#ef4444' : '#94a3b8',
        width: 20,
        height: 20,
      },
    }));

    return getLayoutedElements(rawNodes, rawEdges);
  }, [data]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <p className="text-lg font-medium mb-2">No topology data</p>
          <p className="text-sm">
            Run <code className="bg-slate-200 px-2 py-1 rounded">topology analyze</code> to generate
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'smoothstep',
      }}
    >
      <Background color="#e2e8f0" gap={16} />
      <Controls className="!bg-white !border-slate-200 !shadow-md" />
      <MiniMap
        nodeColor={(node) => {
          const nodeData = node.data as unknown as TopologyNodeData | undefined;
          switch (nodeData?.type) {
            case 'COMPONENT':
              return '#10b981';
            case 'UTILITY':
              return '#f59e0b';
            default:
              return '#64748b';
          }
        }}
        className="!bg-white !border-slate-200"
      />
    </ReactFlow>
  );
}
