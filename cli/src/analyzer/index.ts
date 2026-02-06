/**
 * AST Analyzer Module
 * Uses Tree-sitter to parse TypeScript files and extract import/export relationships
 */

export {
  analyzeDirectory,
  saveTopologyData,
  loadExistingData,
  createSnapshot,
  type AnalyzeOptions,
  type HistoryOptions,
} from './scanner.js';
export {
  parseFile,
  parseContentForExports,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedImport,
  type ParsedFile,
} from './parser.js';
