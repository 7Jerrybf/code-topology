/**
 * Graph builder - constructs topology graph from parsed files
 */

import { basename, dirname } from 'path';
import type {
  TopologyGraph,
  TopologyNode,
  TopologyEdge,
  NodeType,
  DiffStatus,
  Language,
} from '@topology/protocol';
import type { ParsedFile } from '../parser/index.js';
import { parseContentForExports } from '../parser/index.js';
import { getFileAtRef, type GitDiffResult } from '../git/index.js';

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

/**
 * Infer node type from file path and language
 */
function inferNodeType(filePath: string, language: Language): NodeType {
  const name = basename(filePath).toLowerCase();
  const dir = dirname(filePath).toLowerCase();

  // Components (React - TSX/JSX)
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) {
    return 'COMPONENT';
  }
  if (dir.includes('component') || dir.includes('components')) {
    return 'COMPONENT';
  }

  // Utilities - common patterns across languages
  if (dir.includes('util') || dir.includes('helper') || dir.includes('lib')) {
    return 'UTILITY';
  }

  // Python-specific patterns
  if (language === 'python') {
    // Python utility modules
    if (name.startsWith('utils') || name.startsWith('helpers')) {
      return 'UTILITY';
    }
    // Python views/controllers can be considered components
    if (dir.includes('views') || dir.includes('controllers')) {
      return 'COMPONENT';
    }
  }

  return 'FILE';
}

/**
 * Resolve Python import path
 * Handles relative imports like '.module' or '..package.module'
 */
function resolvePythonImportPath(
  fromFile: string,
  importSource: string,
  nodeMap: Map<string, TopologyNode>
): string | null {
  const fromDir = dirname(fromFile).replace(/\\/g, '/');

  // Count leading dots for relative imports
  let dotCount = 0;
  for (const char of importSource) {
    if (char === '.') {
      dotCount++;
    } else {
      break;
    }
  }

  if (dotCount === 0) {
    // Absolute import - try to find in node map directly
    const modulePath = importSource.replace(/\./g, '/');
    const candidates = [
      `${modulePath}.py`,
      `${modulePath}/__init__.py`,
    ];
    for (const candidate of candidates) {
      if (nodeMap.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // Relative import
  const relativePart = importSource.slice(dotCount);
  let basePath = fromDir;

  // Go up directories based on dot count (. = current, .. = parent, etc.)
  for (let i = 1; i < dotCount; i++) {
    basePath = dirname(basePath);
  }

  // Convert module path to file path
  const modulePath = relativePart.replace(/\./g, '/');
  const resolved = modulePath ? normalizePath(`${basePath}/${modulePath}`) : basePath;

  // Try possible file paths
  const candidates = [
    `${resolved}.py`,
    `${resolved}/__init__.py`,
  ];

  for (const candidate of candidates) {
    if (nodeMap.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve relative import path to actual file path
 */
function resolveImportPath(
  fromFile: string,
  importSource: string,
  nodeMap: Map<string, TopologyNode>,
  language: Language
): string | null {
  const fromDir = dirname(fromFile).replace(/\\/g, '/');

  if (language === 'python') {
    return resolvePythonImportPath(fromFile, importSource, nodeMap);
  }

  // JavaScript/TypeScript import resolution
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
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (nodeMap.has(withExt)) {
      return withExt;
    }
  }

  return null;
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
    const baseSignature = parseContentForExports(baseContent, filePath);

    // Compare signatures
    return baseSignature !== currentSignature;
  } catch {
    return false;
  }
}

/**
 * Build topology graph from parsed files
 */
export async function buildGraph(
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
      type: inferNodeType(file.filePath, file.language),
      status,
      astSignature: file.exportSignature, // Use export signature instead of content hash
      language: file.language,
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
      const targetPath = resolveImportPath(file.filePath, imp.source, nodeMap, file.language);
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
