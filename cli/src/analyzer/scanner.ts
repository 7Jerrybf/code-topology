/**
 * Directory scanner - finds and parses TypeScript files
 * Builds topology graph from import relationships
 */

import { glob } from 'glob';
import { resolve, dirname, basename } from 'path';
import type { TopologyGraph, TopologyNode, TopologyEdge, NodeType, DiffStatus } from '../types.js';
import { parseFile, parseContentForExports, type ParsedFile } from './parser.js';
import { getGitDiff, getFileAtRef, type GitDiffResult } from '../git/index.js';

export interface AnalyzeOptions {
  /** Base branch to compare against (default: auto-detect main/master) */
  baseBranch?: string;
  /** Whether to skip git diff analysis */
  skipGitDiff?: boolean;
}

/**
 * Analyze a directory and generate topology graph
 * @param dirPath - Path to the directory to analyze
 * @param options - Analysis options
 * @returns TopologyGraph data structure
 */
export async function analyzeDirectory(
  dirPath: string,
  options: AnalyzeOptions = {}
): Promise<TopologyGraph> {
  const absolutePath = resolve(dirPath);
  console.log(`📂 Scanning directory: ${absolutePath}`);

  // Find all TypeScript files
  const rawFiles = await glob('**/*.{ts,tsx}', {
    cwd: absolutePath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.d.ts'],
    absolute: false,
  });

  // Normalize paths (convert backslashes to forward slashes)
  const files = rawFiles.map(f => toForwardSlash(f));

  console.log(`📄 Found ${files.length} TypeScript files`);

  // Parse all files
  const parsedFiles: ParsedFile[] = [];
  for (const file of files) {
    const parsed = await parseFile(file, absolutePath);
    if (parsed) {
      // Normalize the file path in parsed result
      parsed.filePath = toForwardSlash(parsed.filePath);
      parsedFiles.push(parsed);
    }
  }

  console.log(`✅ Successfully parsed ${parsedFiles.length} files`);

  // Get git diff status
  let gitDiff: GitDiffResult | null = null;
  if (!options.skipGitDiff) {
    gitDiff = await getGitDiff(absolutePath, options.baseBranch);
  }

  // Build topology graph with git status
  const graph = await buildGraph(parsedFiles, absolutePath, gitDiff);

  // Count stats
  const changedNodes = graph.nodes.filter(n => n.status !== 'UNCHANGED').length;
  const brokenEdges = graph.edges.filter(e => e.isBroken).length;

  console.log(`🔗 Generated ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
  if (changedNodes > 0) {
    console.log(`📊 ${changedNodes} changed files detected`);
  }
  if (brokenEdges > 0) {
    console.log(`⚠️  ${brokenEdges} potentially broken dependencies`);
  }

  return graph;
}

/**
 * Convert Windows backslashes to forward slashes
 */
function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Build topology graph from parsed files
 */
async function buildGraph(
  parsedFiles: ParsedFile[],
  basePath: string,
  gitDiff: GitDiffResult | null
): Promise<TopologyGraph> {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodeMap = new Map<string, TopologyNode>();
  const fileMap = new Map<string, ParsedFile>();

  // Track files with changed export signatures
  const changedExportFiles = new Set<string>();

  // Create nodes for each file
  for (const file of parsedFiles) {
    // Determine diff status
    let status: DiffStatus = 'UNCHANGED';
    if (gitDiff) {
      status = gitDiff.fileStatus.get(file.filePath) || 'UNCHANGED';
    }

    const node: TopologyNode = {
      id: file.filePath,
      label: basename(file.filePath),
      type: inferNodeType(file.filePath),
      status,
      astSignature: file.exportSignature, // Use export signature instead of content hash
    };
    nodes.push(node);
    nodeMap.set(file.filePath, node);
    fileMap.set(file.filePath, file);

    // If file is modified, check if exports changed
    if (status === 'MODIFIED' && gitDiff?.baseBranch) {
      const hasExportChange = await checkExportSignatureChange(
        basePath,
        file.filePath,
        file.exportSignature,
        gitDiff.baseBranch
      );
      if (hasExportChange) {
        changedExportFiles.add(file.filePath);
      }
    }
  }

  // Create edges for import relationships
  let edgeId = 0;
  for (const file of parsedFiles) {
    for (const imp of file.imports) {
      // Only process relative imports (skip node_modules)
      if (!imp.isRelative) {
        continue;
      }

      // Resolve the import path
      const targetPath = resolveImportPath(file.filePath, imp.source, nodeMap);
      if (targetPath && nodeMap.has(targetPath)) {
        // Check if this edge is broken:
        // - Target file's exports changed
        // - But source file didn't change (may have stale imports)
        const targetNode = nodeMap.get(targetPath)!;
        const sourceNode = nodeMap.get(file.filePath)!;

        const isBroken =
          changedExportFiles.has(targetPath) &&
          sourceNode.status === 'UNCHANGED';

        // Also mark as broken if target is deleted
        const isTargetDeleted = targetNode.status === 'DELETED';

        const edge: TopologyEdge = {
          id: `e${edgeId++}`,
          source: file.filePath,
          target: targetPath,
          isBroken: isBroken || isTargetDeleted,
        };
        edges.push(edge);
      }
    }
  }

  return {
    nodes,
    edges,
    timestamp: Date.now(),
  };
}

/**
 * Check if a file's export signature changed compared to base branch
 */
async function checkExportSignatureChange(
  repoPath: string,
  filePath: string,
  currentSignature: string,
  baseBranch: string
): Promise<boolean> {
  try {
    // Get file content at base branch
    const baseContent = await getFileAtRef(repoPath, filePath, baseBranch);
    if (!baseContent) {
      // File didn't exist in base branch = new file, exports are "new" not "changed"
      return false;
    }

    // Parse exports from base version
    const isTsx = filePath.endsWith('.tsx');
    const baseSignature = parseContentForExports(baseContent, isTsx);

    // Compare signatures
    return baseSignature !== currentSignature;
  } catch {
    return false;
  }
}

/**
 * Infer node type from file path
 */
function inferNodeType(filePath: string): NodeType {
  const name = basename(filePath).toLowerCase();
  const dir = dirname(filePath).toLowerCase();

  // Components (React)
  if (dir.includes('component') || name.endsWith('.tsx')) {
    return 'COMPONENT';
  }

  // Utilities
  if (dir.includes('util') || dir.includes('helper') || dir.includes('lib')) {
    return 'UTILITY';
  }

  return 'FILE';
}

/**
 * Resolve relative import path to actual file path
 */
function resolveImportPath(
  fromFile: string,
  importSource: string,
  nodeMap: Map<string, TopologyNode>
): string | null {
  const fromDir = dirname(fromFile).replace(/\\/g, '/');

  // Handle ESM .js extension (maps to .ts in source)
  let source = importSource;
  if (source.endsWith('.js')) {
    source = source.slice(0, -3); // Remove .js
  }

  // Normalize the path
  const resolved = normalizePath(`${fromDir}/${source}`);

  // Try exact match first
  if (nodeMap.has(resolved)) {
    return resolved;
  }

  // Try with extensions
  const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (nodeMap.has(withExt)) {
      return withExt;
    }
  }

  return null;
}

/**
 * Normalize path (resolve . and ..)
 */
function normalizePath(path: string): string {
  // Convert backslashes to forward slashes first
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const result: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }

  return result.join('/');
}
