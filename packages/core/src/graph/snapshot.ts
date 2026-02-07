/**
 * Snapshot management - handle topology data persistence and history
 */

import { readFile, writeFile } from 'fs/promises';
import type {
  TopologyGraph,
  TopologySnapshot,
  TopologyDataFile,
  SnapshotMetadata,
} from '@topology/protocol';
import { getCurrentCommitInfo } from '../git/index.js';

export interface HistoryOptions {
  /** Enable history mode (append to existing snapshots) */
  history?: boolean;
  /** Maximum number of snapshots to keep */
  maxSnapshots?: number;
  /** Custom label for this snapshot */
  label?: string;
}

/**
 * Load existing topology data file (supports both v1 and v2 formats)
 */
export async function loadExistingData(
  filePath: string
): Promise<TopologyDataFile | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return migrateToV2(data);
  } catch {
    return null;
  }
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
 * Create a snapshot from a graph with metadata
 */
export async function createSnapshot(
  graph: TopologyGraph,
  repoPath: string,
  label?: string
): Promise<TopologySnapshot> {
  // Get git commit info
  const commitInfo = await getCurrentCommitInfo(repoPath);

  const metadata: SnapshotMetadata = {
    timestamp: graph.timestamp,
    commitHash: commitInfo?.hash || null,
    commitMessage: commitInfo?.message || null,
    branch: commitInfo?.branch || null,
    label: label || null,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    changedCount: graph.nodes.filter((n) => n.status !== 'UNCHANGED').length,
    brokenCount: graph.edges.filter((e) => e.isBroken).length,
  };

  return {
    metadata,
    graph,
  };
}

/**
 * Save topology data with optional history management
 */
export async function saveTopologyData(
  outputPath: string,
  graph: TopologyGraph,
  repoPath: string,
  options: HistoryOptions = {}
): Promise<TopologyDataFile> {
  const { history = false, maxSnapshots = 50, label } = options;

  // Create new snapshot
  const snapshot = await createSnapshot(graph, repoPath, label);

  let dataFile: TopologyDataFile;

  if (history) {
    // Load existing data or create new
    const existing = await loadExistingData(outputPath);

    if (existing) {
      // Append to existing snapshots
      existing.snapshots.push(snapshot);
      existing.currentIndex = existing.snapshots.length - 1;

      // Trim to max snapshots (keep most recent)
      if (existing.snapshots.length > maxSnapshots) {
        const excess = existing.snapshots.length - maxSnapshots;
        existing.snapshots.splice(0, excess);
        existing.currentIndex = existing.snapshots.length - 1;
      }

      dataFile = existing;
    } else {
      // Create new file with single snapshot
      dataFile = {
        version: 2,
        currentIndex: 0,
        snapshots: [snapshot],
      };
    }
  } else {
    // Non-history mode: single snapshot (overwrite)
    dataFile = {
      version: 2,
      currentIndex: 0,
      snapshots: [snapshot],
    };
  }

  // Write to file
  await writeFile(outputPath, JSON.stringify(dataFile, null, 2), 'utf-8');

  return dataFile;
}
