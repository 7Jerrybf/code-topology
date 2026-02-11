/**
 * High-level directory analysis orchestrator
 * Coordinates parsing, git diff, and graph building
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import type { TopologyGraph, Language } from '@topology/protocol';
import {
  parseFileContent,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedFile,
} from './parser/index.js';
import { getGitDiff, type GitDiffResult } from './git/index.js';
import { buildGraph } from './graph/index.js';
import { CacheDb } from './cache/db.js';
import { ParseCache } from './cache/parseCache.js';
import { simpleHash } from './cache/contentHash.js';
import { ModelManager } from './embedding/modelManager.js';
import { Embedder } from './embedding/embedder.js';
import { EmbeddingCache } from './embedding/embeddingCache.js';
import { findSemanticEdges } from './embedding/similarity.js';

export interface AnalyzeOptions {
  /** Base branch to compare against (default: auto-detect main/master) */
  baseBranch?: string;
  /** Whether to skip git diff analysis */
  skipGitDiff?: boolean;
  /** Disable SQLite cache (full re-parse every time) */
  noCache?: boolean;
  /** Custom directory for cache DB (default: <repo>/.topology/) */
  cacheDir?: string;
  /** Disable semantic embedding analysis */
  noEmbeddings?: boolean;
  /** Cosine similarity threshold for semantic edges (default: 0.7) */
  similarityThreshold?: number;
  /** Maximum semantic edges per file (default: 3) */
  maxSemanticEdgesPerFile?: number;
}

/**
 * Convert Windows backslashes to forward slashes
 */
function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Map Language to parseFileContent mode
 */
function langToMode(lang: Language): 'js' | 'python' {
  return lang === 'python' ? 'python' : 'js';
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

  // Initialize cache (if enabled)
  let cacheDb: CacheDb | null = null;
  let parseCache: ParseCache | null = null;
  const useCache = !options.noCache;

  if (useCache) {
    try {
      cacheDb = new CacheDb(absolutePath, options.cacheDir);
      cacheDb.open();
      parseCache = new ParseCache(cacheDb);
    } catch (err) {
      console.warn(`⚠️  Failed to initialize cache, proceeding without: ${(err as Error).message}`);
      cacheDb = null;
      parseCache = null;
    }
  }

  // Parse files (with incremental caching)
  const parsedFiles: ParsedFile[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  const newlyParsed: ParsedFile[] = [];

  for (const file of files) {
    const fullPath = join(absolutePath, file);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue; // Skip unreadable files
    }

    const hash = simpleHash(content);
    const normalizedFile = toForwardSlash(file);

    // Try cache first
    if (parseCache) {
      const cached = parseCache.get(normalizedFile, hash);
      if (cached) {
        parsedFiles.push(cached);
        cacheHits++;
        continue;
      }
    }

    // Cache miss — parse with Tree-sitter
    const lang = detectLanguage(file);
    if (!lang) continue;

    const parsed = parseFileContent(content, file, langToMode(lang));
    if (parsed) {
      parsed.filePath = normalizedFile;
      parsedFiles.push(parsed);
      newlyParsed.push(parsed);
      cacheMisses++;
    }
  }

  // Write new results to cache in batch
  if (parseCache && newlyParsed.length > 0) {
    try {
      parseCache.setBatch(newlyParsed);
    } catch (err) {
      console.warn(`⚠️  Failed to write cache: ${(err as Error).message}`);
    }
  }

  // Prune deleted files from cache
  if (parseCache) {
    try {
      const existingFiles = new Set(files.map(f => toForwardSlash(f)));
      const pruned = parseCache.prune(existingFiles);
      if (pruned > 0) {
        console.log(`🗑️  Pruned ${pruned} deleted files from cache`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to prune cache: ${(err as Error).message}`);
    }
  }

  console.log(`✅ Successfully parsed ${parsedFiles.length} files`);
  if (useCache) {
    console.log(`💾 Cache: ${cacheHits} hits, ${cacheMisses} misses`);
  }

  // Get git diff status
  let gitDiff: GitDiffResult | null = null;
  if (!options.skipGitDiff) {
    gitDiff = await getGitDiff(absolutePath, options.baseBranch);
  }

  // Build topology graph with git status
  const graph = await buildGraph(parsedFiles, absolutePath, gitDiff);

  // --- Semantic Embedding Analysis (Slow Lane) ---
  const noEmbeddings = options.noEmbeddings ?? false;
  const similarityThreshold = options.similarityThreshold ?? 0.7;
  const maxPerFile = options.maxSemanticEdgesPerFile ?? 3;
  const MAX_FILES_FOR_EMBEDDING = 1000;

  if (!noEmbeddings && files.length <= MAX_FILES_FOR_EMBEDDING) {
    try {
      // Prepare file contents map (filePath → content)
      const fileContents = new Map<string, { content: string; hash: string }>();
      for (const file of files) {
        const fullPath = join(absolutePath, file);
        try {
          const content = await readFile(fullPath, 'utf-8');
          const hash = simpleHash(content);
          fileContents.set(toForwardSlash(file), { content, hash });
        } catch {
          // Skip unreadable
        }
      }

      // Initialize model manager + embedder
      const modelManager = new ModelManager(absolutePath, options.cacheDir);
      const { modelPath, vocabPath } = await modelManager.ensureModel();
      const embedder = new Embedder(modelPath, vocabPath);
      await embedder.init();

      // Initialize embedding cache
      let embeddingCache: EmbeddingCache | null = null;
      if (cacheDb) {
        try {
          embeddingCache = new EmbeddingCache(cacheDb);
        } catch {
          // Fallback: no cache
        }
      }

      // Generate embeddings (with caching)
      const embeddings = new Map<string, number[]>();
      let embCacheHits = 0;
      let embCacheMisses = 0;
      const newEmbeddings: { filePath: string; contentHash: string; embedding: number[]; modelId: string }[] = [];

      for (const [filePath, { content, hash }] of fileContents) {
        // Try cache
        if (embeddingCache) {
          const cached = embeddingCache.get(filePath, hash);
          if (cached) {
            embeddings.set(filePath, cached);
            embCacheHits++;
            continue;
          }
        }

        // Cache miss — run inference
        try {
          const embedding = await embedder.embed(content);
          embeddings.set(filePath, embedding);
          newEmbeddings.push({ filePath, contentHash: hash, embedding, modelId: modelManager.modelId });
          embCacheMisses++;
        } catch {
          // Skip individual file failures
        }
      }

      // Write new embeddings to cache
      if (embeddingCache && newEmbeddings.length > 0) {
        try {
          embeddingCache.setBatch(newEmbeddings);
        } catch {
          // Ignore cache write errors
        }
      }

      // Prune stale embeddings
      if (embeddingCache) {
        try {
          const existingFiles = new Set(fileContents.keys());
          embeddingCache.prune(existingFiles);
        } catch {
          // Ignore
        }
      }

      // Build existing edge set for filtering
      const existingEdgeSet = new Set<string>();
      for (const edge of graph.edges) {
        existingEdgeSet.add(`${edge.source}\u2192${edge.target}`);
      }

      // Find semantic edges
      const semanticEdges = findSemanticEdges(embeddings, existingEdgeSet, {
        threshold: similarityThreshold,
        maxPerFile,
      });

      // Append semantic edges to graph
      for (const se of semanticEdges) {
        graph.edges.push({
          id: `semantic:${se.source}→${se.target}`,
          source: se.source,
          target: se.target,
          isBroken: false,
          linkType: 'semantic',
          similarity: Math.round(se.similarity * 1000) / 1000,
        });
      }

      console.log(`\u{1F52E} Semantic: ${semanticEdges.length} edges found (threshold: ${similarityThreshold})`);
      if (useCache) {
        console.log(`   Embedding cache: ${embCacheHits} hits, ${embCacheMisses} misses`);
      }

      embedder.dispose();
    } catch (err) {
      console.warn(`\u26A0\uFE0F  Semantic analysis skipped: ${(err as Error).message}`);
    }
  } else if (!noEmbeddings && files.length > MAX_FILES_FOR_EMBEDDING) {
    console.warn(`\u26A0\uFE0F  Too many files (${files.length}), skipping semantic analysis (max: ${MAX_FILES_FOR_EMBEDDING})`);
  }

  // Close cache DB
  if (cacheDb) {
    cacheDb.close();
  }

  // Count stats
  const depEdges = graph.edges.filter(e => e.linkType !== 'semantic');
  const semEdges = graph.edges.filter(e => e.linkType === 'semantic');
  const changedNodes = graph.nodes.filter(n => n.status !== 'UNCHANGED').length;
  const brokenEdges = depEdges.filter(e => e.isBroken).length;

  console.log(`\u{1F517} Generated ${graph.nodes.length} nodes and ${depEdges.length} dependency edges`);
  if (semEdges.length > 0) {
    console.log(`   + ${semEdges.length} semantic edges`);
  }
  if (changedNodes > 0) {
    console.log(`\u{1F4CA} ${changedNodes} changed files detected`);
  }
  if (brokenEdges > 0) {
    console.log(`\u26A0\uFE0F  ${brokenEdges} potentially broken dependencies`);
  }

  return graph;
}
