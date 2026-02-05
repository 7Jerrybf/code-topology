/**
 * Tree-sitter based TypeScript/TSX parser
 * Extracts import statements from source files
 */

import Parser from 'tree-sitter';
// @ts-ignore - tree-sitter-typescript has no type declarations
import TypeScript from 'tree-sitter-typescript';
import { readFile } from 'fs/promises';
import { extname } from 'path';

/** Represents a parsed import statement */
export interface ParsedImport {
  /** The module specifier (e.g., './utils', 'react') */
  source: string;
  /** Named imports (e.g., ['useState', 'useEffect']) */
  namedImports: string[];
  /** Default import name if present */
  defaultImport: string | null;
  /** Whether it's a relative import */
  isRelative: boolean;
}

/** Result of parsing a single file */
export interface ParsedFile {
  /** Relative file path */
  filePath: string;
  /** All imports found in the file */
  imports: ParsedImport[];
  /** Hash of file content for change detection */
  contentHash: string;
}

// Initialize Tree-sitter parser
const parser = new Parser();

/**
 * Parse a TypeScript/TSX file and extract imports
 * @param filePath - Path to the file
 * @param basePath - Base directory for resolving relative paths
 */
export async function parseFile(filePath: string, basePath: string): Promise<ParsedFile | null> {
  const fullPath = `${basePath}/${filePath}`;

  try {
    // Set language based on file extension
    const ext = extname(filePath);
    if (ext === '.tsx') {
      parser.setLanguage(TypeScript.tsx);
    } else {
      parser.setLanguage(TypeScript.typescript);
    }

    // Read and parse file
    const content = await readFile(fullPath, 'utf-8');
    const tree = parser.parse(content);

    // Extract imports
    const imports = extractImports(tree.rootNode);

    // Generate simple content hash
    const contentHash = simpleHash(content);

    return {
      filePath,
      imports,
      contentHash,
    };
  } catch (error) {
    // Fail gracefully - log warning and skip file
    console.warn(`⚠️  Failed to parse ${filePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Extract all import statements from AST (including re-exports)
 */
function extractImports(rootNode: Parser.SyntaxNode): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const child of rootNode.children) {
    // Regular import statements
    if (child.type === 'import_statement') {
      const parsed = parseImportStatement(child);
      if (parsed) {
        imports.push(parsed);
      }
    }
    // Re-export statements: export { x } from './y'
    else if (child.type === 'export_statement') {
      const parsed = parseReExportStatement(child);
      if (parsed) {
        imports.push(parsed);
      }
    }
  }

  return imports;
}

/**
 * Parse a single import_statement node
 */
function parseImportStatement(node: Parser.SyntaxNode): ParsedImport | null {
  let source = '';
  let defaultImport: string | null = null;
  const namedImports: string[] = [];

  for (const child of node.children) {
    switch (child.type) {
      case 'string':
        // Module specifier (remove quotes)
        source = child.text.slice(1, -1);
        break;

      case 'import_clause':
        // Process import clause (default and named imports)
        for (const clauseChild of child.children) {
          if (clauseChild.type === 'identifier') {
            // Default import
            defaultImport = clauseChild.text;
          } else if (clauseChild.type === 'named_imports') {
            // Named imports { a, b, c }
            for (const namedChild of clauseChild.children) {
              if (namedChild.type === 'import_specifier') {
                const nameNode = namedChild.childForFieldName('name');
                if (nameNode) {
                  namedImports.push(nameNode.text);
                }
              }
            }
          } else if (clauseChild.type === 'namespace_import') {
            // import * as name
            const nameNode = clauseChild.children.find(c => c.type === 'identifier');
            if (nameNode) {
              defaultImport = `* as ${nameNode.text}`;
            }
          }
        }
        break;
    }
  }

  if (!source) {
    return null;
  }

  return {
    source,
    namedImports,
    defaultImport,
    isRelative: source.startsWith('.') || source.startsWith('/'),
  };
}

/**
 * Parse a re-export statement: export { x } from './y' or export * from './y'
 */
function parseReExportStatement(node: Parser.SyntaxNode): ParsedImport | null {
  let source = '';
  const namedImports: string[] = [];

  // Look for the source string in the export statement
  for (const child of node.children) {
    if (child.type === 'string') {
      source = child.text.slice(1, -1);
    } else if (child.type === 'export_clause') {
      // Named re-exports: export { a, b } from './y'
      for (const exportChild of child.children) {
        if (exportChild.type === 'export_specifier') {
          const nameNode = exportChild.childForFieldName('name');
          if (nameNode) {
            namedImports.push(nameNode.text);
          }
        }
      }
    }
  }

  // Only return if this is a re-export (has a source)
  if (!source) {
    return null;
  }

  return {
    source,
    namedImports,
    defaultImport: null,
    isRelative: source.startsWith('.') || source.startsWith('/'),
  };
}

/**
 * Simple string hash for content change detection
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
