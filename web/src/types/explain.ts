/**
 * Types for the AI explain feature
 */

export interface ExplainRequest {
  /** Path to the source file (the importer) */
  sourceFile: string;
  /** Path to the target file (the exporter that changed) */
  targetFile: string;
}

export interface ExplainResult {
  /** Summary of what changed in the target file */
  whatChanged: string;
  /** Explanation of why this might break the source file */
  whyBreaking: string;
  /** Suggestions for how to fix the issue */
  howToFix: string;
}

export interface ExplainError {
  /** Error code for categorization */
  code: 'NO_API_KEY' | 'RATE_LIMIT' | 'NETWORK_ERROR' | 'FILE_NOT_FOUND' | 'UNKNOWN';
  /** Human-readable error message */
  message: string;
}
