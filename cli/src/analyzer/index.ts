/**
 * AST Analyzer Module
 * Uses Tree-sitter to parse TypeScript files and extract import/export relationships
 */

export { analyzeDirectory, type AnalyzeOptions } from './scanner.js';
export { parseFile, parseContentForExports, type ParsedImport, type ParsedFile } from './parser.js';
