/**
 * Cloud-based semantic edge discovery using ANN search
 * Replaces brute-force O(n²) with per-file cloud queries
 */

import type { VectorStore } from './vectorStore.js';
import type { SemanticEdge } from './similarity.js';

export interface CloudSearchOptions {
  threshold: number;
  maxPerFile: number;
}

/**
 * Find semantic edges using cloud vector store ANN queries.
 * For each file, queries topK*2 nearest neighbors and filters by threshold.
 *
 * @param store - Cloud VectorStore instance
 * @param embeddings - Map of filePath → embedding vector
 * @param existingEdgeSet - Set of existing import edges ("source→target")
 * @param options - Threshold and per-file limits
 */
export async function findSemanticEdgesCloud(
  store: VectorStore,
  embeddings: Map<string, number[]>,
  existingEdgeSet: Set<string>,
  options: CloudSearchOptions,
): Promise<SemanticEdge[]> {
  const { threshold, maxPerFile } = options;
  const files = Array.from(embeddings.keys());
  const selectedEdges = new Set<string>();
  const result: SemanticEdge[] = [];

  for (const filePath of files) {
    const vector = embeddings.get(filePath)!;

    // Query more candidates than needed to account for filtering
    const candidates = await store.query(vector, maxPerFile * 2);

    let count = 0;
    for (const candidate of candidates) {
      if (count >= maxPerFile) break;

      // Skip self
      if (candidate.id === filePath) continue;

      // Skip below threshold
      if (candidate.score < threshold) continue;

      // Skip if import edge already exists
      const key1 = `${filePath}\u2192${candidate.id}`;
      const key2 = `${candidate.id}\u2192${filePath}`;
      if (existingEdgeSet.has(key1) || existingEdgeSet.has(key2)) continue;

      // Canonical ordering for dedup (source < target)
      const [source, target] =
        filePath < candidate.id
          ? [filePath, candidate.id]
          : [candidate.id, filePath];

      const edgeKey = `${source}\u2192${target}`;
      if (selectedEdges.has(edgeKey)) continue;

      selectedEdges.add(edgeKey);
      result.push({ source, target, similarity: candidate.score });
      count++;
    }
  }

  result.sort((a, b) => b.similarity - a.similarity);
  return result;
}
