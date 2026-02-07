/**
 * Built-in TypeScript/JavaScript language plugin
 * Wraps the existing Tree-sitter based parser
 */

import type { LanguagePlugin, ParsedFile } from '../types.js';
import {
  parseFileContent,
  parseContentForExports,
} from '../../parser/parser.js';

export const typescriptPlugin: LanguagePlugin = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],

  parse(content: string, filePath: string, _basePath: string): ParsedFile | null {
    return parseFileContent(content, filePath, 'js');
  },

  extractExportsFromContent(content: string, filePath: string): string {
    return parseContentForExports(content, filePath);
  },
};
