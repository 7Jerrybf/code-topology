/**
 * Git event watcher - monitors .git/ directory for git operations
 * Detects commits, branch switches, merges, rebases, etc.
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { resolve, join } from 'path';
import { readFile } from 'fs/promises';
import type { GitEventType } from '@topology/protocol';

export interface GitWatcherOptions {
  /** Path to the repository root (must contain .git/) */
  path: string;
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number;
}

export interface GitWatcherEvent {
  eventType: GitEventType;
  branch: string;
  commitHash?: string;
  previousBranch?: string;
  timestamp: number;
}

/**
 * Watches .git/ directory to detect git operations
 * Emits 'git_event' when a git operation is detected
 */
export class GitWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private repoPath: string;
  private gitDir: string;
  private debounceMs: number;
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentBranch: string | null = null;
  private currentCommitHash: string | null = null;

  constructor(options: GitWatcherOptions) {
    super();
    this.repoPath = resolve(options.path);
    this.gitDir = join(this.repoPath, '.git');
    this.debounceMs = options.debounceMs ?? 500;
  }

  /**
   * Start watching for git events
   */
  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    // Read initial state
    await this.readCurrentState();

    const watchPaths = [
      join(this.gitDir, 'HEAD'),
      join(this.gitDir, 'refs', 'heads'),
      join(this.gitDir, 'MERGE_HEAD'),
      join(this.gitDir, 'rebase-merge'),
      join(this.gitDir, 'rebase-apply'),
    ];

    return new Promise((resolve) => {
      this.watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true,
        // Windows may need polling for .git/ directory
        usePolling: process.platform === 'win32',
        interval: 300,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.watcher
        .on('ready', () => {
          this.emit('ready');
          resolve();
        })
        .on('add', (path) => this.handleGitFileChange(path))
        .on('change', (path) => this.handleGitFileChange(path))
        .on('unlink', (path) => this.handleGitFileChange(path))
        .on('error', (error) => {
          this.emit('error', error);
        });
    });
  }

  /**
   * Read the current branch name and commit hash from .git/HEAD
   */
  private async readCurrentState(): Promise<void> {
    try {
      const headContent = await readFile(join(this.gitDir, 'HEAD'), 'utf-8');
      const trimmed = headContent.trim();

      if (trimmed.startsWith('ref: refs/heads/')) {
        // Symbolic ref → on a branch
        this.currentBranch = trimmed.replace('ref: refs/heads/', '');

        // Read the commit hash for this branch
        try {
          const refPath = join(this.gitDir, 'refs', 'heads', this.currentBranch);
          this.currentCommitHash = (await readFile(refPath, 'utf-8')).trim();
        } catch {
          // packed-refs or branch doesn't exist yet
          this.currentCommitHash = null;
        }
      } else {
        // Detached HEAD → store the hash directly
        this.currentBranch = null;
        this.currentCommitHash = trimmed;
      }
    } catch {
      this.currentBranch = null;
      this.currentCommitHash = null;
    }
  }

  /**
   * Handle changes to files inside .git/
   */
  private handleGitFileChange(filePath: string): void {
    // Debounce: git operations often modify multiple files rapidly
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.detectAndEmitEvent(filePath);
    }, this.debounceMs);
  }

  /**
   * Detect what kind of git event happened and emit it
   */
  private async detectAndEmitEvent(_triggerPath: string): Promise<void> {
    const previousBranch = this.currentBranch;
    const previousCommitHash = this.currentCommitHash;

    // Re-read current state
    await this.readCurrentState();

    let eventType: GitEventType = 'unknown';

    // Detect merge
    try {
      await readFile(join(this.gitDir, 'MERGE_HEAD'), 'utf-8');
      eventType = 'merge';
    } catch {
      // No MERGE_HEAD → not a merge
    }

    // Detect rebase
    if (eventType === 'unknown') {
      try {
        const { stat } = await import('fs/promises');
        try {
          await stat(join(this.gitDir, 'rebase-merge'));
          eventType = 'rebase';
        } catch {
          await stat(join(this.gitDir, 'rebase-apply'));
          eventType = 'rebase';
        }
      } catch {
        // Not a rebase
      }
    }

    // Detect branch switch vs commit
    if (eventType === 'unknown') {
      if (previousBranch !== this.currentBranch) {
        // Branch name changed → branch_switch
        eventType = 'branch_switch';
      } else if (previousCommitHash !== this.currentCommitHash && this.currentCommitHash) {
        // Same branch but different commit → commit
        eventType = 'commit';
      }
    }

    // Only emit if we actually detected something meaningful
    if (eventType === 'unknown' && previousCommitHash === this.currentCommitHash && previousBranch === this.currentBranch) {
      return;
    }

    const event: GitWatcherEvent = {
      eventType,
      branch: this.currentBranch ?? 'HEAD (detached)',
      commitHash: this.currentCommitHash ?? undefined,
      previousBranch: previousBranch !== this.currentBranch ? (previousBranch ?? undefined) : undefined,
      timestamp: Date.now(),
    };

    this.emit('git_event', event);
  }

  /**
   * Stop watching for git events
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
  }

  /**
   * Get the repository path being watched
   */
  getRepoPath(): string {
    return this.repoPath;
  }
}
