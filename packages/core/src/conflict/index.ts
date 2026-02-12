/**
 * Conflict detection module — cross-branch semantic conflict warnings
 * @module @topology/core/conflict
 */

export {
  detectConflicts,
  type DetectConflictsOptions,
} from './detector.js';

export {
  listOtherBranches,
  getBranchModifiedFiles,
} from './branchDiff.js';
