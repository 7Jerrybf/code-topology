/**
 * Built-in Python language plugin
 * Wraps the existing Tree-sitter based parser
 */

import type { LanguagePlugin, ParsedFile } from '../types.js';
import {
  parseFileContent,
  parseContentForExports,
} from '../../parser/parser.js';

export const pythonPlugin: LanguagePlugin = {
  name: 'python',
  extensions: ['.py'],

  parse(content: string, filePath: string, _basePath: string): ParsedFile | null {
    return parseFileContent(content, filePath, 'python');
  },

  extractExportsFromContent(content: string, filePath: string): string {
    return parseContentForExports(content, filePath);
  },
};
