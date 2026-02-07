/**
 * Parser module - multi-language AST parsing and import/export extraction
 * @module @topology/core/parser
 */

export {
  parseFile,
  parseFileContent,
  parseContentForExports,
  detectLanguage,
  SUPPORTED_EXTENSIONS,
  type ParsedFile,
  type ParsedImport,
} from './parser.js';
