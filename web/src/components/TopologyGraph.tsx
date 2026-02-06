'use client';

import { useCallback, useMemo } from 'react';
import { useTheme } from 'next-themes';
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
import type { TopologyGraph as TopologyGraphData, TopologyEdge } from '@/types/topology';

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
  onBrokenEdgeClick?: (edge: TopologyEdge) => void;
  highlightedNodeIds?: Set<string>;
  selectedNodeId?: string | null;
}

export function TopologyGraph({
  data,
  onNodeClick,
  onBrokenEdgeClick,
  highlightedNodeIds,
  selectedNodeId,
}: TopologyGraphProps) {
  const hasHighlight = highlightedNodeIds && highlightedNodeIds.size > 0;

  const { nodes, edges } = useMemo(() => {
    if (!data) {
      return { nodes: [], edges: [] };
    }

    const rawNodes: Node[] = data.nodes.map((node) => {
      const isHighlighted = hasHighlight && highlightedNodeIds?.has(node.id);
      const isFaded = hasHighlight && !highlightedNodeIds?.has(node.id);

      return {
        id: node.id,
        type: 'topology',
        position: { x: 0, y: 0 },
        selected: selectedNodeId === node.id,
        data: {
          label: node.label,
          type: node.type,
          status: node.status,
          fullPath: node.id,
          language: node.language,
          isHighlighted,
          isFaded,
        } satisfies TopologyNodeData,
      };
    });

    const rawEdges: Edge[] = data.edges.map((edge) => {
      // Check if edge is part of the highlighted chain
      const isEdgeHighlighted =
        hasHighlight &&
        highlightedNodeIds?.has(edge.source) &&
        highlightedNodeIds?.has(edge.target);
      const isEdgeFaded = hasHighlight && !isEdgeHighlighted;

      const baseStyle = edge.isBroken
        ? { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5,5', cursor: 'pointer' }
        : { stroke: '#94a3b8', strokeWidth: 1.5 };

      const fadeStyle = isEdgeFaded ? { opacity: 0.2 } : {};
      const highlightStyle = isEdgeHighlighted && !edge.isBroken
        ? { stroke: '#3b82f6', strokeWidth: 2 }
        : {};

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: edge.isBroken,
        data: { isBroken: edge.isBroken },
        style: { ...baseStyle, ...fadeStyle, ...highlightStyle },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isEdgeHighlighted && !edge.isBroken ? '#3b82f6' : edge.isBroken ? '#ef4444' : '#94a3b8',
          width: 20,
          height: 20,
        },
      };
    });

    return getLayoutedElements(rawNodes, rawEdges);
  }, [data, highlightedNodeIds, selectedNodeId, hasHighlight]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      // Only trigger for broken edges
      if (edge.data?.isBroken && onBrokenEdgeClick) {
        const originalEdge = data?.edges.find((e) => e.id === edge.id);
        if (originalEdge) {
          onBrokenEdgeClick(originalEdge);
        }
      }
    },
    [data?.edges, onBrokenEdgeClick]
  );

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center text-slate-500 dark:text-slate-400">
          <p className="text-lg font-medium mb-2">No topology data</p>
          <p className="text-sm">
            Run <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">topology analyze</code> to generate
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
      onEdgeClick={handleEdgeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'smoothstep',
      }}
      className={isDark ? 'dark' : ''}
    >
      <Background color={isDark ? '#334155' : '#e2e8f0'} gap={16} />
      <Controls className={isDark ? '!bg-slate-800 !border-slate-600 !shadow-md [&>button]:!bg-slate-800 [&>button]:!border-slate-600 [&>button]:!fill-slate-300 [&>button:hover]:!bg-slate-700' : '!bg-white !border-slate-200 !shadow-md'} />
      <MiniMap
        nodeColor={(node) => {
          const nodeData = node.data as unknown as TopologyNodeData | undefined;
          switch (nodeData?.type) {
            case 'COMPONENT':
              return '#10b981';
            case 'UTILITY':
              return '#f59e0b';
            default:
              return isDark ? '#475569' : '#64748b';
          }
        }}
        className={isDark ? '!bg-slate-800 !border-slate-600' : '!bg-white !border-slate-200'}
        maskColor={isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 245, 249, 0.6)'}
      />
    </ReactFlow>
  );
}
