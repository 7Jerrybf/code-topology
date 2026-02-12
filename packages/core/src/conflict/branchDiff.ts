/**
 * Cross-branch diff utilities using isomorphic-git
 * Compares branch trees by OID to find modified files without reading content
 */

import git from 'isomorphic-git';
import fs from 'node:fs';
import { SUPPORTED_EXTENSIONS } from '../parser/index.js';

/** Directories to skip during tree walking */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.topology',
  '.next',
  'coverage',
  '__pycache__',
]);

/**
 * Check if a file has a supported source code extension
 */
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

/**
 * List all local branches except current and base
 */
export async function listOtherBranches(
  dir: string,
  currentBranch: string,
  baseBranch: string,
): Promise<string[]> {
  try {
    const branches = await git.listBranches({ fs, dir });
    return branches.filter(
      (b) => b !== currentBranch && b !== baseBranch,
    );
  } catch {
    return [];
  }
}

/**
 * Get the list of modified files on a branch compared to a base branch.
 * Uses git.walk() to compare TREE objects by OID — no file content is read.
 */
export async function getBranchModifiedFiles(
  dir: string,
  branch: string,
  baseBranch: string,
): Promise<string[]> {
  try {
    // Verify both refs resolve
    await git.resolveRef({ fs, dir, ref: branch });
    await git.resolveRef({ fs, dir, ref: baseBranch });
  } catch {
    return [];
  }

  const modifiedFiles: string[] = [];

  try {
    await git.walk({
      fs,
      dir,
      trees: [git.TREE({ ref: baseBranch }), git.TREE({ ref: branch })],
      map: async (filepath, [baseEntry, branchEntry]) => {
        // Skip root
        if (filepath === '.') return undefined;

        // Skip excluded directories
        const topDir = filepath.split('/')[0]!;
        if (SKIP_DIRS.has(topDir)) return undefined;

        // Check if this is a directory by looking at the entry type
        const baseType = baseEntry ? await baseEntry.type() : null;
        const branchType = branchEntry ? await branchEntry.type() : null;

        if (baseType === 'tree' || branchType === 'tree') {
          // Continue walking into subdirectories
          return undefined;
        }

        // Only consider supported source files
        if (!isSupportedFile(filepath)) return undefined;

        const baseOid = baseEntry ? await baseEntry.oid() : null;
        const branchOid = branchEntry ? await branchEntry.oid() : null;

        // File differs (added, modified, or deleted on branch vs base)
        if (baseOid !== branchOid) {
          modifiedFiles.push(filepath);
        }

        return undefined;
      },
    });
  } catch {
    // walk can fail if branch tree is corrupt or empty
    return [];
  }

  return modifiedFiles;
}
