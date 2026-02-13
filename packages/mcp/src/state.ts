import { analyzeDirectory, type AnalyzeOptions, CacheDb, AuthDb, resolveAuthContext, AuditLogger, resolveVectorConfig, createVectorStore, type VectorStore } from '@topology/core';
import type { TopologyGraph, AuthContext, VectorStoreConfig } from '@topology/protocol';

export class TopologyState {
  private graph: TopologyGraph | null = null;
  private analyzeInProgress: Promise<TopologyGraph> | null = null;
  private readonly analyzePath: string;
  private cacheDb: CacheDb | null = null;
  private _authDb: AuthDb | null = null;
  private _authContext: AuthContext | null = null;
  private _auditLogger: AuditLogger | null = null;
  private _vectorStoreConfig: VectorStoreConfig | null = null;
  private _cloudStore: VectorStore | null = null;

  constructor(path?: string) {
    this.analyzePath = path ?? process.cwd();
  }

  /**
   * Initialize auth and audit subsystems.
   * Call this once after construction.
   */
  initAuth(): void {
    this.cacheDb = new CacheDb(this.analyzePath);
    this.cacheDb.open();
    this._authDb = new AuthDb(this.cacheDb.database);
    this._auditLogger = new AuditLogger(this.cacheDb.database);

    // Resolve auth context from TOPOLOGY_API_KEY env var
    const apiKey = process.env.TOPOLOGY_API_KEY;
    const ctx = resolveAuthContext(this._authDb, { apiKey });

    if (!ctx && this._authDb.isAuthEnabled()) {
      console.error(
        'Error: Auth is enabled but no valid TOPOLOGY_API_KEY provided.\n' +
        'Set TOPOLOGY_API_KEY environment variable to a valid API key.'
      );
      process.exit(1);
    }

    this._authContext = ctx;

    // Resolve vector store config from env vars
    this._vectorStoreConfig = resolveVectorConfig();
  }

  /**
   * Lazily initialize cloud vector store (on first use).
   */
  async getCloudStore(): Promise<VectorStore | null> {
    if (this._cloudStore) return this._cloudStore;

    const cfg = this._vectorStoreConfig;
    if (!cfg || cfg.provider === 'sqlite') return null;

    try {
      this._cloudStore = await createVectorStore(cfg, this.cacheDb ?? undefined);
      return this._cloudStore;
    } catch (err) {
      console.warn(`Failed to init cloud vector store: ${(err as Error).message}`);
      return null;
    }
  }

  get authContext(): AuthContext | null {
    return this._authContext;
  }

  get auditLogger(): AuditLogger | null {
    return this._auditLogger;
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

    // Merge vector store config into options
    const mergedOptions: AnalyzeOptions = {
      ...options,
      vectorStoreConfig: options?.vectorStoreConfig ?? this._vectorStoreConfig ?? undefined,
    };

    this.analyzeInProgress = analyzeDirectory(this.analyzePath, mergedOptions)
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

  getAnalyzePath(): string {
    return this.analyzePath;
  }

  close(): void {
    this._cloudStore?.close().catch(() => {});
    this._auditLogger?.close();
    this.cacheDb?.close();
  }
}
