/**
 * Types for the AI explain feature
 */

import { z } from 'zod';

export const ExplainRequestSchema = z.object({
  /** Path to the source file (the importer) */
  sourceFile: z.string(),
  /** Path to the target file (the exporter that changed) */
  targetFile: z.string(),
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export const ExplainResultSchema = z.object({
  /** Summary of what changed in the target file */
  whatChanged: z.string(),
  /** Explanation of why this might break the source file */
  whyBreaking: z.string(),
  /** Suggestions for how to fix the issue */
  howToFix: z.string(),
});
export type ExplainResult = z.infer<typeof ExplainResultSchema>;

export const ExplainErrorCodeSchema = z.enum([
  'NO_API_KEY',
  'RATE_LIMIT',
  'NETWORK_ERROR',
  'FILE_NOT_FOUND',
  'UNKNOWN',
]);
export type ExplainErrorCode = z.infer<typeof ExplainErrorCodeSchema>;

export const ExplainErrorSchema = z.object({
  /** Error code for categorization */
  code: ExplainErrorCodeSchema,
  /** Human-readable error message */
  message: z.string(),
});
export type ExplainError = z.infer<typeof ExplainErrorSchema>;
