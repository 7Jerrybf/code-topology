/**
 * Cross-branch conflict detector
 * Detects direct, dependency, and semantic conflicts between branches
 */

import git from 'isomorphic-git';
import fs from 'node:fs';
import type { TopologyGraph, ConflictWarning, ConflictType, ConflictSeverity } from '@topology/protocol';
import { listOtherBranches, getBranchModifiedFiles } from './branchDiff.js';

export interface DetectConflictsOptions {
  /** Path to the git repository */
  repoPath: string;
  /** Current topology graph (with edges for dependency + semantic lookup) */
  graph: TopologyGraph;
  /** Base branch name (default: auto-detect main/master) */
  baseBranch?: string;
  /** Current branch name (default: auto-detect) */
  currentBranch?: string;
}

/**
 * Auto-detect the base branch (main or master)
 */
async function detectBaseBranch(dir: string): Promise<string | null> {
  try {
    const branches = await git.listBranches({ fs, dir });
    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect potential conflicts between the current branch and all other local branches.
 *
 * Conflict levels:
 * - **direct** (high): Both branches modify the same file
 * - **dependency** (medium): Branches modify files that have a dependency edge in the graph
 * - **semantic** (low): Branches modify files that have a semantic similarity edge in the graph
 */
export async function detectConflicts(
  options: DetectConflictsOptions,
): Promise<ConflictWarning[]> {
  const { repoPath, graph, baseBranch, currentBranch } = options;

  // Resolve current branch
  let currentBranchName = currentBranch;
  if (!currentBranchName) {
    try {
      currentBranchName =
        (await git.currentBranch({ fs, dir: repoPath, fullname: false })) ?? undefined;
    } catch {
      return [];
    }
  }
  if (!currentBranchName) return [];

  // Resolve base branch
  const base = baseBranch ?? (await detectBaseBranch(repoPath));
  if (!base) return [];

  // If we're on the base branch, skip conflict detection
  if (currentBranchName === base) return [];

  // Get files modified on current branch vs base
  const currentModifiedFiles = await getBranchModifiedFiles(
    repoPath,
    currentBranchName,
    base,
  );
  if (currentModifiedFiles.length === 0) return [];

  // Build edge lookup structures from the graph for fast O(1) querying
  const dependencyEdges = new Set<string>();
  const semanticEdges = new Map<string, number>(); // key -> similarity

  for (const edge of graph.edges) {
    const key = edgeKey(edge.source, edge.target);
    if (edge.linkType === 'semantic') {
      semanticEdges.set(key, edge.similarity ?? 0);
    } else {
      dependencyEdges.add(key);
    }
  }

  const currentModifiedSet = new Set(currentModifiedFiles);

  // List other branches (excluding current and base)
  const otherBranches = await listOtherBranches(repoPath, currentBranchName, base);

  const warnings: ConflictWarning[] = [];
  const now = Date.now();
  let conflictIndex = 0;

  for (const otherBranch of otherBranches) {
    const otherModifiedFiles = await getBranchModifiedFiles(
      repoPath,
      otherBranch,
      base,
    );

    for (const otherFile of otherModifiedFiles) {
      // 1. Direct conflict: same file modified on both branches
      if (currentModifiedSet.has(otherFile)) {
        warnings.push(createWarning({
          index: conflictIndex++,
          type: 'direct',
          severity: 'high',
          currentBranch: currentBranchName,
          otherBranch,
          currentFile: otherFile,
          otherFile,
          description: `Both branches modify "${otherFile}"`,
          timestamp: now,
        }));
        continue; // direct conflict already covers this pair
      }

      // 2. Check against all current modified files for dependency/semantic conflicts
      for (const currentFile of currentModifiedFiles) {
        const key = edgeKey(currentFile, otherFile);

        if (dependencyEdges.has(key)) {
          warnings.push(createWarning({
            index: conflictIndex++,
            type: 'dependency',
            severity: 'medium',
            currentBranch: currentBranchName,
            otherBranch,
            currentFile,
            otherFile,
            description: `"${currentFile}" and "${otherFile}" have a dependency relationship`,
            timestamp: now,
          }));
        } else if (semanticEdges.has(key)) {
          const similarity = semanticEdges.get(key)!;
          warnings.push(createWarning({
            index: conflictIndex++,
            type: 'semantic',
            severity: 'low',
            currentBranch: currentBranchName,
            otherBranch,
            currentFile,
            otherFile,
            similarity,
            description: `"${currentFile}" and "${otherFile}" are semantically similar (${(similarity * 100).toFixed(0)}%)`,
            timestamp: now,
          }));
        }
      }
    }
  }

  // Sort by severity: high > medium > low
  const severityOrder: Record<ConflictSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return warnings;
}

/**
 * Create a consistent edge lookup key (order-independent)
 */
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function createWarning(params: {
  index: number;
  type: ConflictType;
  severity: ConflictSeverity;
  currentBranch: string;
  otherBranch: string;
  currentFile: string;
  otherFile: string;
  similarity?: number;
  description: string;
  timestamp: number;
}): ConflictWarning {
  return {
    id: `conflict-${params.timestamp}-${params.index}`,
    type: params.type,
    severity: params.severity,
    currentBranch: params.currentBranch,
    otherBranch: params.otherBranch,
    currentFile: params.currentFile,
    otherFile: params.otherFile,
    similarity: params.similarity,
    description: params.description,
    timestamp: params.timestamp,
  };
}
