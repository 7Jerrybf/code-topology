/**
 * AST Analyzer Module
 * Uses Tree-sitter to parse TypeScript files and extract import/export relationships
 */

export { analyzeDirectory } from './scanner.js';
export { parseFile, type ParsedImport, type ParsedFile } from './parser.js';
