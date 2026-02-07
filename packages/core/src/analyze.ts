/**
 * High-level directory analysis orchestrator
 * Coordinates parsing, git diff, and graph building
 */

import { glob } from 'glob';
import { resolve } from 'path';
import type { TopologyGraph, Language } from '@topology/protocol';
import {
  parseFile,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedFile,
} from './parser/index.js';
import { getGitDiff, type GitDiffResult } from './git/index.js';
import { buildGraph } from './graph/index.js';

export interface AnalyzeOptions {
  /** Base branch to compare against (default: auto-detect main/master) */
  baseBranch?: string;
  /** Whether to skip git diff analysis */
  skipGitDiff?: boolean;
}

/**
 * Convert Windows backslashes to forward slashes
 */
function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
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
