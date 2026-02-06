/**
 * Zustand store for topology data with time travel and search support
 */

import { create } from 'zustand';
import Fuse from 'fuse.js';
import type {
  TopologyGraph,
  TopologySnapshot,
  TopologyDataFile,
  SnapshotMetadata,
  TopologyNode,
  NodeType,
  DiffStatus,
  Language,
} from '@/types/topology';

interface TopologyStore {
  // Data
  snapshots: TopologySnapshot[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;

  // Computed (derived from snapshots + currentIndex)
  currentSnapshot: TopologySnapshot | null;
  currentGraph: TopologyGraph | null;
  currentMetadata: SnapshotMetadata | null;

  // Search & Filter state
  searchQuery: string;
  typeFilters: Set<NodeType>;
  statusFilters: Set<DiffStatus>;
  languageFilters: Set<Language>;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  isSearchFocused: boolean;

  // Timeline Actions
  loadData: () => Promise<void>;
  setCurrentIndex: (index: number) => void;
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLatest: () => void;

  // Search & Filter Actions
  setSearchQuery: (query: string) => void;
  toggleTypeFilter: (type: NodeType) => void;
  toggleStatusFilter: (status: DiffStatus) => void;
  toggleLanguageFilter: (language: Language) => void;
  selectNode: (nodeId: string | null) => void;
  clearSearch: () => void;
  setSearchFocused: (focused: boolean) => void;

  // Computed search helpers
  getFilteredNodes: () => TopologyNode[];
  getSearchResults: () => TopologyNode[];
}

/**
 * Migrate v1 (single graph) to v2 (snapshots array) format
 */
function migrateToV2(data: unknown): TopologyDataFile {
  // Check if already v2 format
  if (
    data &&
    typeof data === 'object' &&
    'version' in data &&
    (data as { version: unknown }).version === 2
  ) {
    return data as TopologyDataFile;
  }

  // Assume v1 format (TopologyGraph directly)
  const legacyGraph = data as TopologyGraph;

  const metadata: SnapshotMetadata = {
    timestamp: legacyGraph.timestamp || Date.now(),
    commitHash: null,
    commitMessage: null,
    branch: null,
    label: null,
    nodeCount: legacyGraph.nodes?.length || 0,
    edgeCount: legacyGraph.edges?.length || 0,
    changedCount: legacyGraph.nodes?.filter((n) => n.status !== 'UNCHANGED').length || 0,
    brokenCount: legacyGraph.edges?.filter((e) => e.isBroken).length || 0,
  };

  return {
    version: 2,
    currentIndex: 0,
    snapshots: [
      {
        metadata,
        graph: legacyGraph,
      },
    ],
  };
}

/**
 * Calculate the dependency chain for a node (upstream and downstream)
 */
function getDependencyChain(
  nodeId: string,
  graph: TopologyGraph
): Set<string> {
  const highlighted = new Set<string>();
  highlighted.add(nodeId);

  // BFS for upstream (nodes this node imports from)
  const upstreamQueue = [nodeId];
  const visitedUp = new Set<string>();
  while (upstreamQueue.length > 0) {
    const current = upstreamQueue.shift()!;
    if (visitedUp.has(current)) continue;
    visitedUp.add(current);

    for (const edge of graph.edges) {
      if (edge.source === current && !visitedUp.has(edge.target)) {
        highlighted.add(edge.target);
        upstreamQueue.push(edge.target);
      }
    }
  }

  // BFS for downstream (nodes that import this node)
  const downstreamQueue = [nodeId];
  const visitedDown = new Set<string>();
  while (downstreamQueue.length > 0) {
    const current = downstreamQueue.shift()!;
    if (visitedDown.has(current)) continue;
    visitedDown.add(current);

    for (const edge of graph.edges) {
      if (edge.target === current && !visitedDown.has(edge.source)) {
        highlighted.add(edge.source);
        downstreamQueue.push(edge.source);
      }
    }
  }

  return highlighted;
}

export const useTopologyStore = create<TopologyStore>((set, get) => ({
  // Initial state
  snapshots: [],
  currentIndex: 0,
  isLoading: true,
  error: null,

  // Search & Filter initial state
  searchQuery: '',
  typeFilters: new Set<NodeType>(),
  statusFilters: new Set<DiffStatus>(),
  languageFilters: new Set<Language>(),
  selectedNodeId: null,
  highlightedNodeIds: new Set<string>(),
  isSearchFocused: false,

  // Computed getters
  get currentSnapshot() {
    const { snapshots, currentIndex } = get();
    return snapshots[currentIndex] || null;
  },

  get currentGraph() {
    const snapshot = get().currentSnapshot;
    return snapshot?.graph || null;
  },

  get currentMetadata() {
    const snapshot = get().currentSnapshot;
    return snapshot?.metadata || null;
  },

  // Timeline Actions
  loadData: async () => {
    set({ isLoading: true, error: null });

    try {
      const res = await fetch('/data/topology-data.json');
      if (!res.ok) {
        throw new Error('No topology data found');
      }

      const rawData = await res.json();
      const dataFile = migrateToV2(rawData);

      set({
        snapshots: dataFile.snapshots,
        currentIndex: dataFile.currentIndex,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
        snapshots: [],
        currentIndex: 0,
      });
    }
  },

  setCurrentIndex: (index: number) => {
    const { snapshots } = get();
    if (index >= 0 && index < snapshots.length) {
      set({ currentIndex: index });
    }
  },

  goToFirst: () => {
    set({ currentIndex: 0 });
  },

  goToPrevious: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  goToNext: () => {
    const { currentIndex, snapshots } = get();
    if (currentIndex < snapshots.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    }
  },

  goToLatest: () => {
    const { snapshots } = get();
    set({ currentIndex: snapshots.length - 1 });
  },

  // Search & Filter Actions
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  toggleTypeFilter: (type: NodeType) => {
    const { typeFilters } = get();
    const newFilters = new Set(typeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    set({ typeFilters: newFilters });
  },

  toggleStatusFilter: (status: DiffStatus) => {
    const { statusFilters } = get();
    const newFilters = new Set(statusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    set({ statusFilters: newFilters });
  },

  toggleLanguageFilter: (language: Language) => {
    const { languageFilters } = get();
    const newFilters = new Set(languageFilters);
    if (newFilters.has(language)) {
      newFilters.delete(language);
    } else {
      newFilters.add(language);
    }
    set({ languageFilters: newFilters });
  },

  selectNode: (nodeId: string | null) => {
    if (nodeId === null) {
      set({ selectedNodeId: null, highlightedNodeIds: new Set() });
      return;
    }

    const graph = get().currentGraph;
    if (!graph) {
      set({ selectedNodeId: nodeId, highlightedNodeIds: new Set([nodeId]) });
      return;
    }

    const highlighted = getDependencyChain(nodeId, graph);
    set({ selectedNodeId: nodeId, highlightedNodeIds: highlighted });
  },

  clearSearch: () => {
    set({
      searchQuery: '',
      typeFilters: new Set(),
      statusFilters: new Set(),
      languageFilters: new Set(),
      selectedNodeId: null,
      highlightedNodeIds: new Set(),
    });
  },

  setSearchFocused: (focused: boolean) => {
    set({ isSearchFocused: focused });
  },

  // Computed search helpers
  getFilteredNodes: () => {
    const { currentGraph, typeFilters, statusFilters, languageFilters } = get();
    if (!currentGraph) return [];

    let nodes = currentGraph.nodes;

    // Apply type filter
    if (typeFilters.size > 0) {
      nodes = nodes.filter((n) => typeFilters.has(n.type));
    }

    // Apply status filter
    if (statusFilters.size > 0) {
      nodes = nodes.filter((n) => statusFilters.has(n.status));
    }

    // Apply language filter
    if (languageFilters.size > 0) {
      nodes = nodes.filter((n) => n.language && languageFilters.has(n.language));
    }

    return nodes;
  },

  getSearchResults: () => {
    const { searchQuery } = get();
    const filteredNodes = get().getFilteredNodes();

    if (!searchQuery.trim()) {
      return filteredNodes;
    }

    // Use Fuse.js for fuzzy search
    const fuse = new Fuse(filteredNodes, {
      keys: ['label', 'id'],
      threshold: 0.4,
      includeScore: true,
    });

    const results = fuse.search(searchQuery);
    return results.map((r) => r.item);
  },
}));
