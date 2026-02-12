/**
 * Conflict Warning types for cross-branch semantic conflict detection
 * Phase 3: The "Arbiter" — Agent Interaction
 */

import { z } from 'zod';

export const ConflictTypeSchema = z.enum(['direct', 'dependency', 'semantic']);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;

export const ConflictSeveritySchema = z.enum(['high', 'medium', 'low']);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

export const ConflictWarningSchema = z.object({
  /** Unique identifier for this conflict warning */
  id: z.string(),
  /** Type of conflict: direct (same file), dependency (linked), semantic (similar) */
  type: ConflictTypeSchema,
  /** Severity: high (direct), medium (dependency), low (semantic) */
  severity: ConflictSeveritySchema,
  /** Current branch name */
  currentBranch: z.string(),
  /** Other branch that has conflicting changes */
  otherBranch: z.string(),
  /** File modified on current branch */
  currentFile: z.string(),
  /** File modified on other branch */
  otherFile: z.string(),
  /** Cosine similarity score (only for semantic conflicts) */
  similarity: z.number().optional(),
  /** Human-readable description of the conflict */
  description: z.string(),
  /** Unix timestamp when the conflict was detected */
  timestamp: z.number(),
});
export type ConflictWarning = z.infer<typeof ConflictWarningSchema>;
