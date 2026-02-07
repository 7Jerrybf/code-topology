/**
 * AST Analyzer Module
 * Re-exported from @topology/core
 */

export {
  analyzeDirectory,
  saveTopologyData,
  loadExistingData,
  createSnapshot,
  type AnalyzeOptions,
  type HistoryOptions,
} from '@topology/core';
export {
  parseFile,
  parseContentForExports,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedImport,
  type ParsedFile,
} from '@topology/core/parser';
