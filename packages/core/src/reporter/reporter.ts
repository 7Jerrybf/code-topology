/**
 * Report generator for topology analysis results
 * Supports Markdown and JSON output formats for CI/CD integration
 */

import type { TopologyGraph, TopologyNode } from '@topology/protocol';

export type ReportFormat = 'markdown' | 'json';

export interface ReportOptions {
  /** The topology graph to report on */
  graph: TopologyGraph;
  /** Output format */
  format: ReportFormat;
  /** Base branch being compared against (for display) */
  baseBranch?: string;
}

export interface ReportSummary {
  totalFiles: number;
  totalDependencies: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  unchangedFiles: number;
  brokenDependencies: number;
  timestamp: number;
}

export interface BrokenDependencyInfo {
  source: string;
  target: string;
  sourceStatus: string;
  targetStatus: string;
  reason: string;
}

export interface JsonReport {
  summary: ReportSummary;
  brokenDependencies: BrokenDependencyInfo[];
  baseBranch?: string;
}

/**
 * Generate a report from topology analysis results
 */
export function generateReport(options: ReportOptions): string {
  const { graph, format, baseBranch } = options;

  const summary = calculateSummary(graph);
  const brokenDeps = getBrokenDependencies(graph);

  if (format === 'json') {
    return generateJsonReport(summary, brokenDeps, baseBranch);
  }

  return generateMarkdownReport(summary, brokenDeps, baseBranch);
}

/**
 * Calculate summary statistics from the graph
 */
function calculateSummary(graph: TopologyGraph): ReportSummary {
  const nodes = graph.nodes;
  const edges = graph.edges;

  return {
    totalFiles: nodes.length,
    totalDependencies: edges.length,
    addedFiles: nodes.filter((n) => n.status === 'ADDED').length,
    modifiedFiles: nodes.filter((n) => n.status === 'MODIFIED').length,
    deletedFiles: nodes.filter((n) => n.status === 'DELETED').length,
    unchangedFiles: nodes.filter((n) => n.status === 'UNCHANGED').length,
    brokenDependencies: edges.filter((e) => e.isBroken).length,
    timestamp: graph.timestamp,
  };
}

/**
 * Get details about broken dependencies
 */
function getBrokenDependencies(graph: TopologyGraph): BrokenDependencyInfo[] {
  const nodeMap = new Map<string, TopologyNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const brokenEdges = graph.edges.filter((e) => e.isBroken);

  return brokenEdges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    const sourceStatus = sourceNode?.status || 'UNKNOWN';
    const targetStatus = targetNode?.status || 'UNKNOWN';

    let reason = 'Unknown issue';
    if (targetStatus === 'DELETED') {
      reason = 'Target file was deleted';
    } else if (targetStatus === 'MODIFIED' && sourceStatus === 'UNCHANGED') {
      reason = 'Target exports changed but source was not updated';
    } else if (targetStatus === 'MODIFIED') {
      reason = 'Target exports changed';
    }

    return {
      source: edge.source,
      target: edge.target,
      sourceStatus,
      targetStatus,
      reason,
    };
  });
}

/**
 * Generate JSON report
 */
function generateJsonReport(
  summary: ReportSummary,
  brokenDeps: BrokenDependencyInfo[],
  baseBranch?: string
): string {
  const report: JsonReport = {
    summary,
    brokenDependencies: brokenDeps,
    baseBranch,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(
  summary: ReportSummary,
  brokenDeps: BrokenDependencyInfo[],
  baseBranch?: string
): string {
  const lines: string[] = [];

  // Header
  lines.push('## Code Topology Analysis Report');
  lines.push('');

  if (baseBranch) {
    lines.push(`Compared against: \`${baseBranch}\``);
    lines.push('');
  }

  // Summary table
  lines.push('### Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Files analyzed | ${summary.totalFiles} |`);
  lines.push(`| Dependencies | ${summary.totalDependencies} |`);
  lines.push(`| Added files | ${summary.addedFiles} |`);
  lines.push(`| Modified files | ${summary.modifiedFiles} |`);
  lines.push(`| Deleted files | ${summary.deletedFiles} |`);
  lines.push(`| Broken dependencies | ${summary.brokenDependencies} |`);
  lines.push('');

  // Broken dependencies
  if (brokenDeps.length > 0) {
    lines.push('### Broken Dependencies');
    lines.push('');
    lines.push('The following dependencies may be broken and require attention:');
    lines.push('');
    lines.push('| Source | Target | Issue |');
    lines.push('|--------|--------|-------|');

    for (const dep of brokenDeps) {
      // Truncate long paths for readability
      const source = truncatePath(dep.source, 40);
      const target = truncatePath(dep.target, 40);
      lines.push(`| \`${source}\` | \`${target}\` | ${dep.reason} |`);
    }

    lines.push('');
  } else {
    lines.push('### Status');
    lines.push('');
    lines.push('No broken dependencies detected.');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`Generated at: ${new Date(summary.timestamp).toISOString()}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Truncate a file path for display
 */
function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) {
    return path;
  }

  // Keep the filename and as much of the path as possible
  const parts = path.split('/');
  const filename = parts[parts.length - 1] ?? path;

  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }

  let result: string = filename;
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    if (!part) continue;
    const candidate = part + '/' + result;
    if (candidate.length + 3 > maxLength) {
      return '...' + result;
    }
    result = candidate;
  }

  return result;
}
