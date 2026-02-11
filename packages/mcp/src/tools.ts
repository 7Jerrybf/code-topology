import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateReport } from '@topology/core';
import type { TopologyEdge } from '@topology/protocol';
import type { TopologyState } from './state.js';

export function registerTools(server: McpServer, state: TopologyState): void {
  // Tool 1: analyze — Analyze the codebase
  server.tool(
    'analyze',
    'Analyze the codebase and build the topology graph. Call this first, or to refresh after code changes.',
    {
      noEmbeddings: z.boolean().optional().describe('Skip semantic embedding analysis'),
      similarityThreshold: z.number().min(0).max(1).optional().describe('Cosine similarity threshold for semantic edges (default: 0.7)'),
    },
    async ({ noEmbeddings, similarityThreshold }) => {
      const graph = await state.refresh({
        noEmbeddings,
        similarityThreshold,
      });

      const depEdges = graph.edges.filter((e) => e.linkType !== 'semantic');
      const semEdges = graph.edges.filter((e) => e.linkType === 'semantic');
      const brokenEdges = graph.edges.filter((e) => e.isBroken);

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

  // Tool 4: find_similar_files — Semantic search
  server.tool(
    'find_similar_files',
    'Find files that are semantically similar to a given file, based on code embeddings.',
    {
      filePath: z.string().describe('File path to find similar files for'),
      limit: z.number().int().min(1).max(50).optional().describe('Max number of results (default: 10)'),
    },
    async ({ filePath, limit }) => {
      const graph = await state.ensureGraph();
      const maxResults = limit ?? 10;

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
              : JSON.stringify(similar, null, 2),
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
