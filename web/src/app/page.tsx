'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopologyGraph } from '@/components/TopologyGraph';
import { ExplainModal } from '@/components/ExplainModal';
import type { TopologyGraph as TopologyGraphData, TopologyNode, TopologyEdge } from '@/types/topology';
import type { ExplainResult, ExplainError } from '@/types/explain';
import { FileCode, Component, Wrench, GitBranch, Clock } from 'lucide-react';

export default function Home() {
  const [graphData, setGraphData] = useState<TopologyGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Explain states
  const [explainEdge, setExplainEdge] = useState<TopologyEdge | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [explainError, setExplainError] = useState<ExplainError | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/data/topology-data.json');
        if (!res.ok) {
          throw new Error('No topology data found');
        }
        const data = await res.json();
        setGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleNodeClick = (nodeId: string) => {
    const node = graphData?.nodes.find((n) => n.id === nodeId);
    setSelectedNode(node || null);
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
      <main className="h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading topology data...</div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-slate-700" />
          <h1 className="text-xl font-semibold text-slate-800">Code Topology</h1>
        </div>
        {graphData && (
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>{graphData.nodes.length} files</span>
            <span>{graphData.edges.length} dependencies</span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {new Date(graphData.timestamp).toLocaleString()}
            </span>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph area */}
        <div className="flex-1">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-600 mb-2">{error}</p>
                <p className="text-sm text-slate-500">
                  Run <code className="bg-slate-200 px-2 py-1 rounded">topology analyze</code> to generate data
                </p>
              </div>
            </div>
          ) : (
            <TopologyGraph
              data={graphData}
              onNodeClick={handleNodeClick}
              onBrokenEdgeClick={handleBrokenEdgeClick}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
          {selectedNode ? (
            <NodeDetails node={selectedNode} edges={graphData?.edges || []} />
          ) : (
            <div className="p-4">
              <h2 className="font-medium text-slate-700 mb-3">Legend</h2>
              <div className="space-y-2 text-sm">
                <LegendItem icon={FileCode} color="bg-slate-100 border-slate-300" label="File" />
                <LegendItem icon={Component} color="bg-emerald-50 border-emerald-400" label="Component" />
                <LegendItem icon={Wrench} color="bg-amber-50 border-amber-400" label="Utility" />
              </div>
              <hr className="my-4 border-slate-200" />
              <p className="text-xs text-slate-500">
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
        <Icon className="w-3 h-3 text-slate-500" />
      </div>
      <span className="text-slate-600">{label}</span>
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
    FILE: { icon: FileCode, label: 'File', color: 'text-slate-600' },
    COMPONENT: { icon: Component, label: 'Component', color: 'text-emerald-600' },
    UTILITY: { icon: Wrench, label: 'Utility', color: 'text-amber-600' },
  };

  const config = typeConfig[node.type];
  const Icon = config.icon;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-slate-100 ${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-800 truncate">{node.label}</h2>
          <p className="text-xs text-slate-500 break-all">{node.id}</p>
        </div>
      </div>

      <div className="space-y-1 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-slate-500">Type</span>
          <span className={`font-medium ${config.color}`}>{config.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Status</span>
          <StatusBadge status={node.status} />
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Hash</span>
          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{node.astSignature}</code>
        </div>
      </div>

      <hr className="my-4 border-slate-200" />

      {/* Imports */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-700 mb-2">
          Imports ({imports.length})
        </h3>
        {imports.length > 0 ? (
          <ul className="space-y-1">
            {imports.map((edge) => (
              <li key={edge.id} className="text-sm text-slate-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="truncate">{edge.target}</span>
                {edge.isBroken && (
                  <span className="text-xs text-red-500 font-medium">BROKEN</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">No imports</p>
        )}
      </div>

      {/* Imported by */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">
          Imported by ({importedBy.length})
        </h3>
        {importedBy.length > 0 ? (
          <ul className="space-y-1">
            {importedBy.map((edge) => (
              <li key={edge.id} className="text-sm text-slate-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="truncate">{edge.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">Not imported anywhere</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TopologyNode['status'] }) {
  const styles = {
    UNCHANGED: 'bg-slate-100 text-slate-600',
    ADDED: 'bg-green-100 text-green-700',
    MODIFIED: 'bg-yellow-100 text-yellow-700',
    DELETED: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}
