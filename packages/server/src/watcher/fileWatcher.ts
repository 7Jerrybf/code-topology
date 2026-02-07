/**
 * File watcher module using chokidar
 * Watches source files for changes and emits events for re-analysis
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { resolve } from 'path';

/** Supported file extensions to watch */
const WATCH_PATTERN = '**/*.{ts,tsx,js,jsx,mjs,cjs,py}';

/** Directories/patterns to ignore */
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
  '**/env/**',
  '**/.env/**',
  '**/.git/**',
  '**/build/**',
  '**/coverage/**',
];

export interface FileWatcherOptions {
  /** Path to watch */
  path: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Additional patterns to ignore */
  ignorePatterns?: string[];
}

export interface FileChangeEvent {
  /** Type of change */
  type: 'add' | 'change' | 'unlink';
  /** Relative file path */
  path: string;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * File watcher that debounces changes and emits consolidated events
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private watchPath: string;
  private debounceMs: number;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private isReady = false;

  constructor(options: FileWatcherOptions) {
    super();
    this.watchPath = resolve(options.path);
    this.debounceMs = options.debounceMs ?? 300;
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.watcher = chokidar.watch(WATCH_PATTERN, {
        cwd: this.watchPath,
        ignored: IGNORE_PATTERNS,
        persistent: true,
        ignoreInitial: true, // Don't fire events for existing files
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.watcher
        .on('ready', () => {
          this.isReady = true;
          this.emit('ready');
          resolve();
        })
        .on('add', (path) => this.handleChange('add', path))
        .on('change', (path) => this.handleChange('change', path))
        .on('unlink', (path) => this.handleChange('unlink', path))
        .on('error', (error) => {
          this.emit('error', error);
          if (!this.isReady) {
            reject(error);
          }
        });
    });
  }

  /**
   * Handle a file change event
   */
  private handleChange(type: FileChangeEvent['type'], path: string): void {
    // Normalize path (forward slashes)
    const normalizedPath = path.replace(/\\/g, '/');

    const event: FileChangeEvent = {
      type,
      path: normalizedPath,
      timestamp: Date.now(),
    };

    // Store the change (overwrites if same file changed multiple times)
    this.pendingChanges.set(normalizedPath, event);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.debounceMs);
  }

  /**
   * Flush all pending changes as a single event
   */
  private flushChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.debounceTimer = null;

    // Emit consolidated change event
    this.emit('changes', changes);
  }

  /**
   * Stop watching for changes
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isReady = false;
  }

  /**
   * Get the path being watched
   */
  getWatchPath(): string {
    return this.watchPath;
  }
}
