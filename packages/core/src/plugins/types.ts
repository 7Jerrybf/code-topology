/**
 * Plugin type definitions for language extensions
 */

import type { Language } from '@topology/protocol';

/** Result of parsing a single import statement */
export interface ParsedImport {
  source: string;
  namedImports: string[];
  defaultImport: string | null;
  isRelative: boolean;
}

/** Result of parsing a single file */
export interface ParsedFile {
  filePath: string;
  imports: ParsedImport[];
  contentHash: string;
  exportSignature: string;
  language: Language;
}

/**
 * Language plugin interface
 * Implement this to add support for a new programming language
 */
export interface LanguagePlugin {
  /** Unique plugin name */
  name: string;
  /** File extensions this plugin handles (e.g., ['.ts', '.tsx']) */
  extensions: string[];
  /** Parse a file and extract imports/exports */
  parse(content: string, filePath: string, basePath: string): ParsedFile | null;
  /** Extract exports from content string (for git diff comparison) */
  extractExportsFromContent?(content: string, filePath: string): string;
}
