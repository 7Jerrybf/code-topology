'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopologyGraph } from '@/components/TopologyGraph';
import { ExplainModal } from '@/components/ExplainModal';
import { TimelineSlider } from '@/components/TimelineSlider';
import { SearchPanel } from '@/components/SearchPanel';
import { LiveIndicator } from '@/components/LiveIndicator';
import { useTopologyStore } from '@/stores/topologyStore';
import { useWebSocketUpdates } from '@/hooks/useWebSocketUpdates';
import type { TopologyNode, TopologyEdge, TopologyGraph as TopologyGraphData, TopologySnapshot } from '@/types/topology';
import type { ExplainResult, ExplainError } from '@/types/explain';
import { FileCode, Component, Wrench, GitBranch, Clock, History } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  // Use zustand store for topology data
  const {
    snapshots,
    currentIndex,
    isLoading: loading,
    error,
    loadData,
    highlightedNodeIds,
    selectedNodeId,
    selectNode,
    liveUpdatesEnabled,
    setWsConnectionStatus,
    addLiveSnapshot,
  } = useTopologyStore();

  // WebSocket live updates
  const handleLiveSnapshot = useCallback((snapshot: TopologySnapshot) => {
    addLiveSnapshot(snapshot);
  }, [addLiveSnapshot]);

  const { connectionStatus } = useWebSocketUpdates({
    url: 'ws://localhost:8765',
    enabled: liveUpdatesEnabled,
    onSnapshot: handleLiveSnapshot,
  });

  // Sync connection status to store
  useEffect(() => {
    setWsConnectionStatus(connectionStatus);
  }, [connectionStatus, setWsConnectionStatus]);

  // Get current graph from store
  const currentSnapshot = snapshots[currentIndex];
  const graphData = currentSnapshot?.graph || null;
  const metadata = currentSnapshot?.metadata;

  // Local state for sidebar display (separate from search selection)
  const [sidebarNode, setSidebarNode] = useState<TopologyNode | null>(null);

  // AI Explain states
  const [explainEdge, setExplainEdge] = useState<TopologyEdge | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [explainError, setExplainError] = useState<ExplainError | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNodeClick = (nodeId: string) => {
    const node = graphData?.nodes.find((n) => n.id === nodeId);
    setSidebarNode(node || null);
    // Also update store selection for highlighting
    selectNode(nodeId);
  };

  const fetchExplanation = useCallback(async (edge: TopologyEdge) => {
    setIsExplaining(true);
    setExplainResult(null);
    setExplainError(null);

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceFile: edge.source,
          targetFile: edge.target,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setExplainError(data as ExplainError);
      } else {
        setExplainResult(data as ExplainResult);
      }
    } catch {
      setExplainError({
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to the server',
      });
    } finally {
      setIsExplaining(false);
    }
  }, []);

  const handleBrokenEdgeClick = useCallback((edge: TopologyEdge) => {
    setExplainEdge(edge);
    fetchExplanation(edge);
  }, [fetchExplanation]);

  const handleCloseExplain = useCallback(() => {
    setExplainEdge(null);
    setExplainResult(null);
    setExplainError(null);
  }, []);

  const handleRetryExplain = useCallback(() => {
    if (explainEdge) {
      fetchExplanation(explainEdge);
    }
  }, [explainEdge, fetchExplanation]);

  if (loading) {
    return (
      <main className="h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="text-slate-500 dark:text-slate-400">Loading topology data...</div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-slate-700 dark:text-slate-300" />
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Code Topology</h1>
        </div>

        {/* Search Panel */}
        {graphData && <SearchPanel />}

        <div className="flex items-center gap-4">
          {graphData && (
            <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span>{graphData.nodes.length} files</span>
              <span>{graphData.edges.length} dependencies</span>
              {snapshots.length > 1 && (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <History className="w-4 h-4" />
                  {currentIndex + 1} / {snapshots.length}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {new Date(graphData.timestamp).toLocaleString()}
              </span>
            </div>
          )}
          <LiveIndicator />
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph area with timeline */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            {error ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-600 dark:text-slate-400 mb-2">{error}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500">
                    Run <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">topology analyze</code> to generate data
                  </p>
                </div>
              </div>
            ) : (
              <TopologyGraph
                data={graphData}
                onNodeClick={handleNodeClick}
                onBrokenEdgeClick={handleBrokenEdgeClick}
                highlightedNodeIds={highlightedNodeIds}
                selectedNodeId={selectedNodeId}
              />
            )}
          </div>

          {/* Timeline slider */}
          {!error && graphData && <TimelineSlider />}
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-y-auto">
          {sidebarNode ? (
            <NodeDetails node={sidebarNode} edges={graphData?.edges || []} />
          ) : (
            <div className="p-4">
              <h2 className="font-medium text-slate-700 dark:text-slate-200 mb-3">Legend</h2>
              <div className="space-y-2 text-sm">
                <LegendItem icon={FileCode} color="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500" label="File" />
                <LegendItem icon={Component} color="bg-emerald-50 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-500" label="Component" />
                <LegendItem icon={Wrench} color="bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-500" label="Utility" />
              </div>
              <hr className="my-4 border-slate-200 dark:border-slate-700" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click on a node to see its details and dependencies.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* AI Explain Modal */}
      <ExplainModal
        edge={explainEdge}
        isOpen={explainEdge !== null}
        onClose={handleCloseExplain}
        isLoading={isExplaining}
        result={explainResult}
        error={explainError}
        onRetry={handleRetryExplain}
      />
    </main>
  );
}

function LegendItem({
  icon: Icon,
  color,
  label,
}: {
  icon: typeof FileCode;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${color}`}>
        <Icon className="w-3 h-3 text-slate-500 dark:text-slate-400" />
      </div>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}

function NodeDetails({
  node,
  edges,
}: {
  node: TopologyNode;
  edges: TopologyGraphData['edges'];
}) {
  const imports = edges.filter((e) => e.source === node.id);
  const importedBy = edges.filter((e) => e.target === node.id);

  const typeConfig = {
    FILE: { icon: FileCode, label: 'File', color: 'text-slate-600 dark:text-slate-400' },
    COMPONENT: { icon: Component, label: 'Component', color: 'text-emerald-600 dark:text-emerald-400' },
    UTILITY: { icon: Wrench, label: 'Utility', color: 'text-amber-600 dark:text-amber-400' },
  };

  const config = typeConfig[node.type];
  const Icon = config.icon;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-slate-100 dark:bg-slate-700 ${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{node.label}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{node.id}</p>
        </div>
      </div>

      <div className="space-y-1 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400">Type</span>
          <span className={`font-medium ${config.color}`}>{config.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400">Status</span>
          <StatusBadge status={node.status} />
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400">Hash</span>
          <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{node.astSignature}</code>
        </div>
      </div>

      <hr className="my-4 border-slate-200 dark:border-slate-700" />

      {/* Imports */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Imports ({imports.length})
        </h3>
        {imports.length > 0 ? (
          <ul className="space-y-1">
            {imports.map((edge) => (
              <li key={edge.id} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span className="truncate">{edge.target}</span>
                {edge.isBroken && (
                  <span className="text-xs text-red-500 font-medium">BROKEN</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic">No imports</p>
        )}
      </div>

      {/* Imported by */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Imported by ({importedBy.length})
        </h3>
        {importedBy.length > 0 ? (
          <ul className="space-y-1">
            {importedBy.map((edge) => (
              <li key={edge.id} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span className="truncate">{edge.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic">Not imported anywhere</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TopologyNode['status'] }) {
  const styles = {
    UNCHANGED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    ADDED: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
    MODIFIED: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
    DELETED: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}
