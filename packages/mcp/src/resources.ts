import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TopologyState } from './state.js';

export function registerResources(server: McpServer, state: TopologyState): void {
  // Resource 1: Full topology graph
  server.resource(
    'graph',
    'topology://graph',
    { description: 'Full topology graph with all nodes and edges (dependency + semantic)' },
    async () => {
      const graph = await state.ensureGraph();
      return {
        contents: [
          {
            uri: 'topology://graph',
            mimeType: 'application/json',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      };
    },
  );

  // Resource 2: Summary statistics
  server.resource(
    'stats',
    'topology://stats',
    { description: 'Summary statistics: node count, edge count, broken edges, semantic edges, languages' },
    async () => {
      const graph = await state.ensureGraph();

      const languageCounts: Record<string, number> = {};
      for (const node of graph.nodes) {
        const lang = node.language ?? 'unknown';
        languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
      }

      const stats = {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        dependencyEdges: graph.edges.filter((e) => e.linkType !== 'semantic').length,
        semanticEdges: graph.edges.filter((e) => e.linkType === 'semantic').length,
        brokenEdges: graph.edges.filter((e) => e.isBroken).length,
        languages: languageCounts,
        timestamp: graph.timestamp,
      };

      return {
        contents: [
          {
            uri: 'topology://stats',
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    },
  );

  // Resource 3: Node detail by file path (ResourceTemplate)
  server.resource(
    'node',
    new ResourceTemplate('topology://node/{filePath}', { list: undefined }),
    { description: 'Node details and related edges for a specific file (use URL-encoded path)' },
    async (uri, params) => {
      const graph = await state.ensureGraph();
      const filePath = decodeURIComponent(params.filePath as string);

      const node = graph.nodes.find((n) => n.id === filePath);
      if (!node) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `Node not found: ${filePath}` }),
            },
          ],
        };
      }

      const imports = graph.edges.filter(
        (e) => e.source === filePath && e.linkType !== 'semantic',
      );
      const importedBy = graph.edges.filter(
        (e) => e.target === filePath && e.linkType !== 'semantic',
      );
      const similar = graph.edges.filter(
        (e) =>
          e.linkType === 'semantic' &&
          (e.source === filePath || e.target === filePath),
      );

      const detail = {
        node,
        imports: imports.map((e) => ({ target: e.target, isBroken: e.isBroken })),
        importedBy: importedBy.map((e) => ({ source: e.source, isBroken: e.isBroken })),
        similar: similar.map((e) => ({
          file: e.source === filePath ? e.target : e.source,
          similarity: e.similarity,
        })),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(detail, null, 2),
          },
        ],
      };
    },
  );
}
