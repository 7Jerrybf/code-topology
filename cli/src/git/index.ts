/**
 * Git Operations Module
 * Uses simple-git to read local git state and compare branches
 */

export { getGitDiff, getFileAtRef, getCurrentCommitInfo, type GitDiffResult, type CommitInfo } from './diff.js';
