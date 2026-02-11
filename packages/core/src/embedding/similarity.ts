/**
 * Cosine similarity calculation and semantic edge discovery
 */

export interface SemanticEdge {
  source: string;
  target: string;
  similarity: number;
}

/**
 * Calculate cosine similarity between two L2-normalized vectors.
 * For normalized vectors, cosine similarity = dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

/**
 * Find semantic edges between files based on embedding similarity.
 * Filters out pairs that already have import-based edges.
 */
export function findSemanticEdges(
  embeddings: Map<string, number[]>,
  existingEdgeSet: Set<string>,
  options: { threshold: number; maxPerFile: number }
): SemanticEdge[] {
  const { threshold, maxPerFile } = options;
  const files = Array.from(embeddings.keys());
  const n = files.length;

  // Collect all candidate pairs above threshold
  const candidatesByFile = new Map<string, SemanticEdge[]>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = files[i]!;
      const b = files[j]!;

      // Skip if import edge already exists (either direction)
      const edgeKey1 = `${a}\u2192${b}`;
      const edgeKey2 = `${b}\u2192${a}`;
      if (existingEdgeSet.has(edgeKey1) || existingEdgeSet.has(edgeKey2)) {
        continue;
      }

      const sim = cosineSimilarity(embeddings.get(a)!, embeddings.get(b)!);
      if (sim < threshold) continue;

      const edge: SemanticEdge = { source: a, target: b, similarity: sim };

      // Track for both files (for per-file limiting)
      if (!candidatesByFile.has(a)) candidatesByFile.set(a, []);
      if (!candidatesByFile.has(b)) candidatesByFile.set(b, []);
      candidatesByFile.get(a)!.push(edge);
      candidatesByFile.get(b)!.push(edge);
    }
  }

  // Select top-K per file, then deduplicate
  const selectedEdges = new Set<string>();
  const result: SemanticEdge[] = [];

  for (const [, candidates] of candidatesByFile) {
    // Sort by similarity descending
    candidates.sort((a, b) => b.similarity - a.similarity);

    let count = 0;
    for (const edge of candidates) {
      if (count >= maxPerFile) break;
      const key = `${edge.source}\u2192${edge.target}`;
      if (!selectedEdges.has(key)) {
        selectedEdges.add(key);
        result.push(edge);
      }
      count++;
    }
  }

  // Sort final result by similarity descending
  result.sort((a, b) => b.similarity - a.similarity);
  return result;
}
