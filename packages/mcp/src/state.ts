import { analyzeDirectory, type AnalyzeOptions } from '@topology/core';
import type { TopologyGraph } from '@topology/protocol';

export class TopologyState {
  private graph: TopologyGraph | null = null;
  private analyzeInProgress: Promise<TopologyGraph> | null = null;
  private readonly analyzePath: string;

  constructor(path?: string) {
    this.analyzePath = path ?? process.cwd();
  }

  async ensureGraph(options?: AnalyzeOptions): Promise<TopologyGraph> {
    if (this.graph) {
      return this.graph;
    }
    return this.refresh(options);
  }

  async refresh(options?: AnalyzeOptions): Promise<TopologyGraph> {
    // Deduplicate concurrent calls
    if (this.analyzeInProgress) {
      return this.analyzeInProgress;
    }

    this.analyzeInProgress = analyzeDirectory(this.analyzePath, options)
      .then((graph) => {
        this.graph = graph;
        this.analyzeInProgress = null;
        return graph;
      })
      .catch((err) => {
        this.analyzeInProgress = null;
        throw err;
      });

    return this.analyzeInProgress;
  }

  getGraph(): TopologyGraph | null {
    return this.graph;
  }
}
