/**
 * Directory scanner - finds and parses TypeScript files
 * Builds topology graph from import relationships
 */

import { glob } from 'glob';
import { resolve, dirname, basename } from 'path';
import type { TopologyGraph, TopologyNode, TopologyEdge, NodeType } from '../types.js';
import { parseFile, type ParsedFile } from './parser.js';

/**
 * Analyze a directory and generate topology graph
 * @param dirPath - Path to the directory to analyze
 * @returns TopologyGraph data structure
 */
export async function analyzeDirectory(dirPath: string): Promise<TopologyGraph> {
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

  // Build topology graph
  const graph = buildGraph(parsedFiles);

  console.log(`🔗 Generated ${graph.nodes.length} nodes and ${graph.edges.length} edges`);

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
function buildGraph(parsedFiles: ParsedFile[]): TopologyGraph {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodeMap = new Map<string, TopologyNode>();

  // Create nodes for each file
  for (const file of parsedFiles) {
    const node: TopologyNode = {
      id: file.filePath,
      label: basename(file.filePath),
      type: inferNodeType(file.filePath),
      status: 'UNCHANGED', // Will be updated by git diff in Phase 3
      astSignature: file.contentHash,
    };
    nodes.push(node);
    nodeMap.set(file.filePath, node);
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
        const edge: TopologyEdge = {
          id: `e${edgeId++}`,
          source: file.filePath,
          target: targetPath,
          isBroken: false, // Will be computed in Phase 3
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
