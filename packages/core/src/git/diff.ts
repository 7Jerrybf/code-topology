/**
 * Git diff utilities - compare branches and detect file changes
 * Uses isomorphic-git for pure JS git operations (no native git dependency)
 */

import git from 'isomorphic-git';
import fs from 'node:fs';
import { resolve } from 'node:path';
import type { DiffStatus } from '@topology/protocol';
import { SUPPORTED_EXTENSIONS } from '../parser/index.js';

export interface GitDiffResult {
  /** Map of file paths to their diff status */
  fileStatus: Map<string, DiffStatus>;
  /** Base branch name that was compared against */
  baseBranch: string | null;
  /** Current branch name */
  currentBranch: string | null;
  /** Whether the repo has uncommitted changes */
  hasUncommittedChanges: boolean;
}

/**
 * Check if a file has a supported source code extension
 */
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

/**
 * Normalize file path (convert backslashes to forward slashes)
 */
function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Auto-detect the base branch (main or master)
 */
async function detectBaseBranch(dir: string): Promise<string | null> {
  try {
    const localBranches = await git.listBranches({ fs, dir });

    // Check for main first, then master
    if (localBranches.includes('main')) {
      return 'main';
    }
    if (localBranches.includes('master')) {
      return 'master';
    }

    // Check remote branches
    try {
      const remoteBranches = await git.listBranches({ fs, dir, remote: 'origin' });
      if (remoteBranches.includes('main')) {
        return 'main';
      }
      if (remoteBranches.includes('master')) {
        return 'master';
      }
    } catch {
      // No remote configured, that's fine
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the diff status of files between current branch and base branch
 * @param repoPath - Path to the git repository
 * @param baseBranch - Base branch to compare against (default: auto-detect main/master)
 * @returns GitDiffResult with file statuses
 */
export async function getGitDiff(
  repoPath: string,
  baseBranch?: string
): Promise<GitDiffResult> {
  const dir = resolve(repoPath);
  const result: GitDiffResult = {
    fileStatus: new Map(),
    baseBranch: null,
    currentBranch: null,
    hasUncommittedChanges: false,
  };

  try {
    // Check if this is a git repo by trying to get current branch
    let currentBranch: string | undefined;
    try {
      currentBranch = await git.currentBranch({ fs, dir, fullname: false }) ?? undefined;
    } catch {
      console.warn('⚠️  Not a git repository, skipping diff analysis');
      return result;
    }

    result.currentBranch = currentBranch ?? null;

    // Auto-detect base branch if not specified
    const effectiveBaseBranch = baseBranch ?? await detectBaseBranch(dir);
    result.baseBranch = effectiveBaseBranch;

    if (!effectiveBaseBranch) {
      console.warn('⚠️  Could not detect base branch (main/master), skipping diff');
      return result;
    }

    // Use statusMatrix to detect all file changes
    // Returns [filepath, HEAD, WORKDIR, STAGE]
    // HEAD: 0=absent, 1=present
    // WORKDIR: 0=absent, 1=unchanged, 2=modified
    // STAGE: 0=absent, 1=unchanged, 2=modified, 3=added (new in stage)
    const matrix = await git.statusMatrix({
      fs,
      dir,
      filter: (f) => isSupportedFile(f),
    });

    // Detect uncommitted changes
    for (const [, head, workdir, stage] of matrix) {
      // File has uncommitted changes if workdir or stage differs from HEAD
      const hasChanges = (head !== 1 || workdir !== 1 || stage !== 1);

      if (hasChanges) {
        result.hasUncommittedChanges = true;
        break;
      }
    }

    // If we're on the base branch, only show uncommitted changes
    if (result.currentBranch === effectiveBaseBranch) {
      console.log(`📊 On ${effectiveBaseBranch} branch, checking uncommitted changes only`);

      for (const [filepath, head, workdir] of matrix) {
        const normalized = normalizeFilePath(filepath);

        if (head === 0 && workdir === 2) {
          // New file (not in HEAD, present in workdir)
          result.fileStatus.set(normalized, 'ADDED');
        } else if (head === 1 && workdir === 2) {
          // Modified file
          result.fileStatus.set(normalized, 'MODIFIED');
        } else if (head === 1 && workdir === 0) {
          // Deleted file
          result.fileStatus.set(normalized, 'DELETED');
        }
      }

      return result;
    }

    // Comparing current branch with base branch
    console.log(`📊 Comparing ${result.currentBranch} with ${effectiveBaseBranch}`);

    // Verify the base branch ref is resolvable
    try {
      await git.resolveRef({ fs, dir, ref: effectiveBaseBranch });
    } catch {
      console.warn(`⚠️  Could not resolve base branch '${effectiveBaseBranch}', skipping diff`);
      return result;
    }

    // Get status matrix comparing against base branch
    const branchMatrix = await git.statusMatrix({
      fs,
      dir,
      ref: effectiveBaseBranch,
      filter: (f) => isSupportedFile(f),
    });

    for (const [filepath, head, workdir] of branchMatrix) {
      const normalized = normalizeFilePath(filepath);

      if (head === 0 && workdir === 2) {
        // Added: not in base branch, present in workdir
        result.fileStatus.set(normalized, 'ADDED');
      } else if (head === 1 && workdir === 2) {
        // Modified: different in workdir vs base branch
        result.fileStatus.set(normalized, 'MODIFIED');
      } else if (head === 1 && workdir === 0) {
        // Deleted: in base branch, not in workdir
        result.fileStatus.set(normalized, 'DELETED');
      }
    }

    console.log(`   Found ${result.fileStatus.size} changed source files`);

  } catch (error) {
    console.warn('⚠️  Git operation failed:', error instanceof Error ? error.message : error);
  }

  return result;
}

/**
 * Get the content of a file at a specific git ref
 */
export async function getFileAtRef(
  repoPath: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  const dir = resolve(repoPath);

  try {
    const commitOid = await git.resolveRef({ fs, dir, ref });

    const { blob } = await git.readBlob({
      fs,
      dir,
      oid: commitOid,
      filepath: normalizeFilePath(filePath),
    });

    return new TextDecoder().decode(blob);
  } catch {
    return null; // File doesn't exist at that ref
  }
}

/** Current commit information */
export interface CommitInfo {
  /** Short commit hash (7 chars) */
  hash: string;
  /** First line of commit message */
  message: string;
  /** Current branch name */
  branch: string;
}

/**
 * Get current commit information (hash, message, branch)
 * @param repoPath - Path to the git repository
 * @returns CommitInfo or null if not a git repo
 */
export async function getCurrentCommitInfo(
  repoPath: string
): Promise<CommitInfo | null> {
  const dir = resolve(repoPath);

  try {
    const branch = await git.currentBranch({ fs, dir, fullname: false });
    if (!branch) {
      return null;
    }

    const commits = await git.log({ fs, dir, depth: 1 });
    if (commits.length === 0) {
      return null;
    }

    const latest = commits[0]!;
    return {
      hash: latest.oid.substring(0, 7),
      message: (latest.commit.message || '').split('\n')[0] || '',
      branch,
    };
  } catch {
    return null;
  }
}
