import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateReport, detectConflicts, hasPermission } from '@topology/core';
import type { TopologyEdge } from '@topology/protocol';
import type { Permission } from '@topology/protocol';
import type { TopologyState } from './state.js';

function permDenied(permission: Permission) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Permission denied: requires "${permission}".`,
      },
    ],
    isError: true,
  };
}

export function registerTools(server: McpServer, state: TopologyState): void {
  const ctx = state.authContext;
  const audit = state.auditLogger;

  // Tool 1: analyze — Analyze the codebase
  server.tool(
    'analyze',
    'Analyze the codebase and build the topology graph. Call this first, or to refresh after code changes.',
    {
      noEmbeddings: z.boolean().optional().describe('Skip semantic embedding analysis'),
      similarityThreshold: z.number().min(0).max(1).optional().describe('Cosine similarity threshold for semantic edges (default: 0.7)'),
    },
    async ({ noEmbeddings, similarityThreshold }) => {
      if (ctx && !hasPermission(ctx, 'analysis:run')) return permDenied('analysis:run');

      const start = Date.now();
      audit?.log({ action: 'analysis:started', userId: ctx?.userId, username: ctx?.username, source: 'mcp' });

      const graph = await state.refresh({
        noEmbeddings,
        similarityThreshold,
      });

      const depEdges = graph.edges.filter((e) => e.linkType !== 'semantic');
      const semEdges = graph.edges.filter((e) => e.linkType === 'semantic');
      const brokenEdges = graph.edges.filter((e) => e.isBroken);

      audit?.log({
        action: 'analysis:completed',
        userId: ctx?.userId,
        username: ctx?.username,
        source: 'mcp',
        durationMs: Date.now() - start,
        details: `nodes=${graph.nodes.length} edges=${graph.edges.length}`,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Analysis complete.`,
              `  Nodes: ${graph.nodes.length}`,
              `  Dependency edges: ${depEdges.length}`,
              `  Semantic edges: ${semEdges.length}`,
              `  Broken edges: ${brokenEdges.length}`,
              `  Timestamp: ${new Date(graph.timestamp).toISOString()}`,
            ].join('\n'),
          },
        ],
      };
    },
  );

  // Tool 2: get_dependencies — Query file dependencies
  server.tool(
    'get_dependencies',
    'Get the dependency chain for a specific file. Shows what it imports and what imports it.',
    {
      filePath: z.string().describe('File path (e.g. "src/utils/auth.ts")'),
      direction: z.enum(['imports', 'importedBy', 'both']).optional().describe('Direction of dependency traversal (default: "both")'),
      depth: z.number().int().min(1).max(10).optional().describe('Max traversal depth (default: 1)'),
    },
    async ({ filePath, direction, depth }) => {
      if (ctx && !hasPermission(ctx, 'graph:read')) return permDenied('graph:read');

      audit?.log({ action: 'dependencies:read', userId: ctx?.userId, username: ctx?.username, source: 'mcp', details: filePath });

      const graph = await state.ensureGraph();
      const dir = direction ?? 'both';
      const maxDepth = depth ?? 1;

      const imports: Array<{ file: string; depth: number; isBroken: boolean }> = [];
      const importedBy: Array<{ file: string; depth: number; isBroken: boolean }> = [];

      if (dir === 'imports' || dir === 'both') {
        bfs(graph.edges, filePath, 'source', 'target', maxDepth, imports);
      }
      if (dir === 'importedBy' || dir === 'both') {
        bfs(graph.edges, filePath, 'target', 'source', maxDepth, importedBy);
      }

      const result = {
        filePath,
        direction: dir,
        depth: maxDepth,
        ...(dir !== 'importedBy' ? { imports } : {}),
        ...(dir !== 'imports' ? { importedBy } : {}),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // Tool 3: get_broken_edges — List all broken dependencies
  server.tool(
    'get_broken_edges',
    'List all broken dependencies in the codebase. A broken edge means the imported file has changed its signature or been deleted.',
    {},
    async () => {
      if (ctx && !hasPermission(ctx, 'graph:read')) return permDenied('graph:read');

      audit?.log({ action: 'broken_edges:read', userId: ctx?.userId, username: ctx?.username, source: 'mcp' });

      const graph = await state.ensureGraph();
      const broken = graph.edges
        .filter((e) => e.isBroken)
        .map((e) => ({
          source: e.source,
          target: e.target,
          linkType: e.linkType ?? 'dependency',
        }));

      return {
        content: [
          {
            type: 'text' as const,
            text: broken.length === 0
              ? 'No broken edges found.'
              : JSON.stringify(broken, null, 2),
          },
        ],
      };
    },
  );

  // Tool 4: find_similar_files — Semantic search (enhanced with cloud vector support)
  server.tool(
    'find_similar_files',
    'Find files that are semantically similar to a given file, based on code embeddings. Supports cloud vector search and cross-repo queries when configured.',
    {
      filePath: z.string().describe('File path to find similar files for'),
      limit: z.number().int().min(1).max(50).optional().describe('Max number of results (default: 10)'),
      crossRepo: z.boolean().optional().describe('Search across all repos in the cloud index (requires cloud vector store)'),
    },
    async ({ filePath, limit, crossRepo }) => {
      if (ctx && !hasPermission(ctx, 'graph:read')) return permDenied('graph:read');

      audit?.log({ action: 'similar_files:read', userId: ctx?.userId, username: ctx?.username, source: 'mcp', details: filePath });

      const graph = await state.ensureGraph();
      const maxResults = limit ?? 10;

      // Try cloud vector search if available
      const cloudStore = await state.getCloudStore();
      if (cloudStore) {
        try {
          // Get the file's embedding from the cloud store
          const records = await cloudStore.fetch([filePath]);
          if (records.length > 0) {
            const vector = records[0]!.embedding;
            // crossRepo=true → don't filter by namespace
            const filter = crossRepo ? { namespace: '' } : undefined;
            const results = await cloudStore.query(vector, maxResults + 1, filter);

            const similar = results
              .filter((r) => r.id !== filePath)
              .slice(0, maxResults)
              .map((r) => ({
                file: r.id,
                similarity: Math.round(r.score * 1000) / 1000,
                ...(crossRepo && r.metadata?.repoId ? { repoId: r.metadata.repoId } : {}),
              }));

            return {
              content: [
                {
                  type: 'text' as const,
                  text: similar.length === 0
                    ? `No similar files found for "${filePath}" via cloud search.`
                    : JSON.stringify({ source: 'cloud', results: similar }, null, 2),
                },
              ],
            };
          }
        } catch {
          // Fallback to graph edges below
        }
      }

      // Fallback: use pre-computed semantic edges from the graph
      const similar = graph.edges
        .filter(
          (e) =>
            e.linkType === 'semantic' &&
            (e.source === filePath || e.target === filePath),
        )
        .map((e) => ({
          file: e.source === filePath ? e.target : e.source,
          similarity: e.similarity ?? 0,
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);

      return {
        content: [
          {
            type: 'text' as const,
            text: similar.length === 0
              ? `No semantic edges found for "${filePath}". Run analyze with embeddings enabled first.`
              : JSON.stringify({ source: 'graph', results: similar }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 5: get_file_impact — Change impact analysis
  server.tool(
    'get_file_impact',
    'Analyze the impact of changing a file. Shows all files that directly or indirectly depend on it (reverse dependency chain).',
    {
      filePath: z.string().describe('File path to analyze impact for'),
    },
    async ({ filePath }) => {
      if (ctx && !hasPermission(ctx, 'graph:read')) return permDenied('graph:read');

      audit?.log({ action: 'file_impact:read', userId: ctx?.userId, username: ctx?.username, source: 'mcp', details: filePath });

      const graph = await state.ensureGraph();
      const impacted: Array<{ file: string; depth: number }> = [];

      bfs(graph.edges, filePath, 'target', 'source', 10, impacted);

      return {
        content: [
          {
            type: 'text' as const,
            text: impacted.length === 0
              ? `No files depend on "${filePath}".`
              : JSON.stringify(
                  {
                    filePath,
                    impactedFiles: impacted.length,
                    files: impacted,
                  },
                  null,
                  2,
                ),
          },
        ],
      };
    },
  );

  // Tool 6: generate_report — Generate analysis report
  server.tool(
    'generate_report',
    'Generate a topology analysis report in Markdown or JSON format.',
    {
      format: z.enum(['markdown', 'json']).optional().describe('Report format (default: "markdown")'),
    },
    async ({ format }) => {
      if (ctx && !hasPermission(ctx, 'report:read')) return permDenied('report:read');

      audit?.log({ action: 'report:generated', userId: ctx?.userId, username: ctx?.username, source: 'mcp' });

      const graph = await state.ensureGraph();
      const reportFormat = format ?? 'markdown';

      const report = generateReport({
        graph,
        format: reportFormat,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: report,
          },
        ],
      };
    },
  );

  // Tool 7: detect_conflicts — Cross-branch conflict detection
  server.tool(
    'detect_conflicts',
    'Detect potential conflicts between the current branch and other local branches. Finds direct (same file), dependency (linked files), and semantic (similar files) conflicts.',
    {
      baseBranch: z.string().optional().describe('Base branch to compare against (default: auto-detect main/master)'),
    },
    async ({ baseBranch }) => {
      if (ctx && !hasPermission(ctx, 'conflicts:detect')) return permDenied('conflicts:detect');

      audit?.log({ action: 'conflicts:detected', userId: ctx?.userId, username: ctx?.username, source: 'mcp' });

      const graph = await state.ensureGraph();
      const repoPath = state.getAnalyzePath();

      const warnings = await detectConflicts({
        repoPath,
        graph,
        baseBranch,
      });

      if (warnings.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No cross-branch conflicts detected.',
            },
          ],
        };
      }

      const highCount = warnings.filter((w) => w.severity === 'high').length;
      const mediumCount = warnings.filter((w) => w.severity === 'medium').length;
      const lowCount = warnings.filter((w) => w.severity === 'low').length;

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Found ${warnings.length} potential conflict(s):`,
              `  Direct (same file): ${highCount}`,
              `  Dependency (linked): ${mediumCount}`,
              `  Semantic (similar): ${lowCount}`,
              '',
              JSON.stringify(warnings, null, 2),
            ].join('\n'),
          },
        ],
      };
    },
  );
}

/**
 * BFS traversal over dependency edges (excludes semantic edges).
 */
function bfs(
  edges: TopologyEdge[],
  startNode: string,
  matchField: 'source' | 'target',
  collectField: 'source' | 'target',
  maxDepth: number,
  results: Array<{ file: string; depth: number; isBroken?: boolean }>,
): void {
  const visited = new Set<string>([startNode]);
  let frontier = [startNode];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const current of frontier) {
      const neighbors = edges.filter(
        (e) => e.linkType !== 'semantic' && e[matchField] === current,
      );

      for (const edge of neighbors) {
        const neighbor = edge[collectField];
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
          results.push({ file: neighbor, depth, isBroken: edge.isBroken });
        }
      }
    }

    frontier = nextFrontier;
  }
}
