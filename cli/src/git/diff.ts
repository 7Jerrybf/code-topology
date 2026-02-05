/**
 * Git diff utilities - compare branches and detect file changes
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import type { DiffStatus } from '../types.js';

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
 * Get the diff status of files between current branch and base branch
 * @param repoPath - Path to the git repository
 * @param baseBranch - Base branch to compare against (default: auto-detect main/master)
 * @returns GitDiffResult with file statuses
 */
export async function getGitDiff(
  repoPath: string,
  baseBranch?: string
): Promise<GitDiffResult> {
  const git = simpleGit(repoPath);
  const result: GitDiffResult = {
    fileStatus: new Map(),
    baseBranch: null,
    currentBranch: null,
    hasUncommittedChanges: false,
  };

  try {
    // Check if this is a git repo
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.warn('⚠️  Not a git repository, skipping diff analysis');
      return result;
    }

    // Get current branch
    const branchInfo = await git.branch();
    result.currentBranch = branchInfo.current;

    // Auto-detect base branch if not specified
    const effectiveBaseBranch = baseBranch ?? await detectBaseBranch(git);
    result.baseBranch = effectiveBaseBranch;

    if (!effectiveBaseBranch) {
      console.warn('⚠️  Could not detect base branch (main/master), skipping diff');
      return result;
    }

    // Check for uncommitted changes
    const status = await git.status();
    result.hasUncommittedChanges = !status.isClean();

    // Skip diff if we're on the base branch
    if (result.currentBranch === effectiveBaseBranch) {
      console.log(`📊 On ${effectiveBaseBranch} branch, checking uncommitted changes only`);

      // Mark uncommitted files
      for (const file of status.modified) {
        if (isTypeScriptFile(file)) {
          result.fileStatus.set(normalizeFilePath(file), 'MODIFIED');
        }
      }
      for (const file of status.created) {
        if (isTypeScriptFile(file)) {
          result.fileStatus.set(normalizeFilePath(file), 'ADDED');
        }
      }
      for (const file of status.deleted) {
        if (isTypeScriptFile(file)) {
          result.fileStatus.set(normalizeFilePath(file), 'DELETED');
        }
      }

      return result;
    }

    // Get diff between current HEAD and base branch
    console.log(`📊 Comparing ${result.currentBranch} with ${effectiveBaseBranch}`);

    // Use name-status to get file status directly
    const diffNameStatus = await git.raw(['diff', '--name-status', `${effectiveBaseBranch}...HEAD`]);
    const lines = diffNameStatus.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const statusCode = parts[0];
      const file = parts[parts.length - 1]; // Handle renames (R100 old new)

      if (!file || !isTypeScriptFile(file)) {
        continue;
      }

      const normalizedPath = normalizeFilePath(file);

      if (statusCode && statusCode.startsWith('A')) {
        result.fileStatus.set(normalizedPath, 'ADDED');
      } else if (statusCode && statusCode.startsWith('D')) {
        result.fileStatus.set(normalizedPath, 'DELETED');
      } else if (statusCode && (statusCode.startsWith('M') || statusCode.startsWith('R'))) {
        result.fileStatus.set(normalizedPath, 'MODIFIED');
      }
    }

    console.log(`   Found ${result.fileStatus.size} changed TypeScript files`);

  } catch (error) {
    console.warn('⚠️  Git operation failed:', error instanceof Error ? error.message : error);
  }

  return result;
}

/**
 * Auto-detect the base branch (main or master)
 */
async function detectBaseBranch(git: SimpleGit): Promise<string | null> {
  try {
    const branches = await git.branch(['-a']);

    // Check for main first, then master
    if (branches.all.includes('main') || branches.all.includes('remotes/origin/main')) {
      return 'main';
    }
    if (branches.all.includes('master') || branches.all.includes('remotes/origin/master')) {
      return 'master';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a file is a TypeScript file
 */
function isTypeScriptFile(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

/**
 * Normalize file path (convert backslashes to forward slashes)
 */
function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Get the content of a file at a specific git ref
 */
export async function getFileAtRef(
  repoPath: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  const git = simpleGit(repoPath);

  try {
    const content = await git.show([`${ref}:${filePath}`]);
    return content;
  } catch {
    return null; // File doesn't exist at that ref
  }
}
