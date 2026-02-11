'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
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
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';

import { TopologyNode, type TopologyNodeData } from './TopologyNode';
import type { TopologyGraph as TopologyGraphData, TopologyEdge } from '@/types/topology';

// Register custom node types
const nodeTypes: NodeTypes = {
  topology: TopologyNode,
};

// ELK layout configuration
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

const elk = new ELK();

async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutResult = await elk.layout(elkGraph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutResult.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
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
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
  const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
  const layoutIdRef = useRef(0);

  useEffect(() => {
    if (!data) {
      setLayoutedNodes([]);
      setLayoutedEdges([]);
      return;
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
      const isEdgeHighlighted =
        hasHighlight &&
        highlightedNodeIds?.has(edge.source) &&
        highlightedNodeIds?.has(edge.target);
      const isEdgeFaded = hasHighlight && !isEdgeHighlighted;

      const baseStyle = edge.isBroken
        ? { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5,5', cursor: 'pointer' }
        : edge.linkType === 'semantic'
          ? { stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '4,4' }
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
        data: { isBroken: edge.isBroken, linkType: edge.linkType, similarity: edge.similarity },
        style: { ...baseStyle, ...fadeStyle, ...highlightStyle },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isEdgeHighlighted && !edge.isBroken ? '#3b82f6' : edge.isBroken ? '#ef4444' : edge.linkType === 'semantic' ? '#8b5cf6' : '#94a3b8',
          width: 20,
          height: 20,
        },
      };
    });

    // Track layout request to prevent stale updates
    const currentId = ++layoutIdRef.current;

    getLayoutedElements(rawNodes, rawEdges).then((result) => {
      if (currentId === layoutIdRef.current) {
        setLayoutedNodes(result.nodes);
        setLayoutedEdges(result.edges);
      }
    });
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
      nodes={layoutedNodes}
      edges={layoutedEdges}
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
