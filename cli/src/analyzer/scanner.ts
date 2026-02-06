/**
 * Directory scanner - finds and parses TypeScript files
 * Builds topology graph from import relationships
 */

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { resolve, dirname, basename } from 'path';
import type {
  TopologyGraph,
  TopologyNode,
  TopologyEdge,
  NodeType,
  DiffStatus,
  TopologySnapshot,
  TopologyDataFile,
  SnapshotMetadata,
  Language,
} from '../types.js';
import { parseFile, parseContentForExports, detectLanguage, SUPPORTED_EXTENSIONS, type ParsedFile } from './parser.js';
import { getGitDiff, getFileAtRef, getCurrentCommitInfo, type GitDiffResult } from '../git/index.js';

export interface AnalyzeOptions {
  /** Base branch to compare against (default: auto-detect main/master) */
  baseBranch?: string;
  /** Whether to skip git diff analysis */
  skipGitDiff?: boolean;
}

export interface HistoryOptions {
  /** Enable history mode (append to existing snapshots) */
  history?: boolean;
  /** Maximum number of snapshots to keep */
  maxSnapshots?: number;
  /** Custom label for this snapshot */
  label?: string;
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

  // Build glob pattern for all supported extensions
  const extensionPattern = SUPPORTED_EXTENSIONS.map(ext => ext.slice(1)).join(',');

  // Find all supported source files
  const rawFiles = await glob(`**/*.{${extensionPattern}}`, {
    cwd: absolutePath,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.d.ts',
      '**/__pycache__/**',
      '**/venv/**',
      '**/.venv/**',
      '**/env/**',
      '**/.env/**',
    ],
    absolute: false,
  });

  // Normalize paths (convert backslashes to forward slashes)
  const files = rawFiles.map(f => toForwardSlash(f));

  // Count files by language
  const languageStats: Record<Language, number> = {
    typescript: 0,
    javascript: 0,
    python: 0,
  };

  for (const file of files) {
    const lang = detectLanguage(file);
    if (lang) {
      languageStats[lang]++;
    }
  }

  console.log(`📄 Found ${files.length} source files`);
  const langDetails = Object.entries(languageStats)
    .filter(([, count]) => count > 0)
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');
  if (langDetails) {
    console.log(`   ${langDetails}`);
  }

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

// ============================================
// Phase 5: Time Travel - Snapshot Management
// ============================================

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
