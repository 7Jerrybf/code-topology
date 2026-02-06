/**
 * Multi-language parser module
 * Uses Tree-sitter to parse TypeScript, JavaScript, and Python files
 * Extracts import statements and export signatures
 */

import Parser from 'tree-sitter';
// @ts-ignore - tree-sitter-typescript has no type declarations
import TypeScript from 'tree-sitter-typescript';
// @ts-ignore - tree-sitter-javascript has no type declarations
import JavaScript from 'tree-sitter-javascript';
// @ts-ignore - tree-sitter-python has no type declarations
import Python from 'tree-sitter-python';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { Language } from '../types.js';

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
  /** Export signature for breaking change detection */
  exportSignature: string;
  /** Programming language of the file */
  language: Language;
}

// Initialize Tree-sitter parser
const parser = new Parser();

// ============================================
// Language Detection
// ============================================

/** File extension to language mapping */
const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
};

/** Supported file extensions for scanning */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE);

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): Language | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || null;
}

/**
 * Set the Tree-sitter language based on file extension
 */
function setParserLanguage(filePath: string): Language | null {
  const ext = extname(filePath).toLowerCase();
  const language = detectLanguage(filePath);

  if (!language) {
    return null;
  }

  switch (language) {
    case 'typescript':
      if (ext === '.tsx') {
        parser.setLanguage(TypeScript.tsx);
      } else {
        parser.setLanguage(TypeScript.typescript);
      }
      break;
    case 'javascript':
      parser.setLanguage(JavaScript);
      break;
    case 'python':
      parser.setLanguage(Python);
      break;
  }

  return language;
}

// ============================================
// Main Parse Function
// ============================================

/**
 * Parse a source file and extract imports/exports
 * @param filePath - Path to the file
 * @param basePath - Base directory for resolving relative paths
 */
export async function parseFile(filePath: string, basePath: string): Promise<ParsedFile | null> {
  const fullPath = `${basePath}/${filePath}`;

  try {
    // Set language based on file extension
    const language = setParserLanguage(filePath);
    if (!language) {
      console.warn(`⚠️  Unsupported file type: ${filePath}`);
      return null;
    }

    // Read and parse file
    const content = await readFile(fullPath, 'utf-8');
    const tree = parser.parse(content);

    // Extract imports and exports based on language
    let imports: ParsedImport[];
    let exports: string[];

    switch (language) {
      case 'typescript':
      case 'javascript':
        imports = extractJsImports(tree.rootNode);
        exports = extractJsExports(tree.rootNode);
        break;
      case 'python':
        imports = extractPythonImports(tree.rootNode);
        exports = extractPythonExports(tree.rootNode);
        break;
      default:
        imports = [];
        exports = [];
    }

    // Generate simple content hash
    const contentHash = simpleHash(content);

    // Generate export signature (sorted list of exports)
    const exportSignature = simpleHash(exports.sort().join(','));

    return {
      filePath,
      imports,
      contentHash,
      exportSignature,
      language,
    };
  } catch (error) {
    // Fail gracefully - log warning and skip file
    console.warn(`⚠️  Failed to parse ${filePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ============================================
// JavaScript/TypeScript Import Extraction
// ============================================

/**
 * Extract all import statements from JS/TS AST (including re-exports)
 */
function extractJsImports(rootNode: Parser.SyntaxNode): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const child of rootNode.children) {
    // Regular import statements
    if (child.type === 'import_statement') {
      const parsed = parseJsImportStatement(child);
      if (parsed) {
        imports.push(parsed);
      }
    }
    // Re-export statements: export { x } from './y'
    else if (child.type === 'export_statement') {
      const parsed = parseJsReExportStatement(child);
      if (parsed) {
        imports.push(parsed);
      }
    }
  }

  return imports;
}

/**
 * Parse a single import_statement node (JS/TS)
 */
function parseJsImportStatement(node: Parser.SyntaxNode): ParsedImport | null {
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
function parseJsReExportStatement(node: Parser.SyntaxNode): ParsedImport | null {
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

// ============================================
// JavaScript/TypeScript Export Extraction
// ============================================

/**
 * Extract all exports from JS/TS AST (function names, variable names, types, etc.)
 */
function extractJsExports(rootNode: Parser.SyntaxNode): string[] {
  const exports: string[] = [];

  for (const child of rootNode.children) {
    if (child.type === 'export_statement') {
      // Check for various export types
      for (const exportChild of child.children) {
        // export function name() {}
        if (exportChild.type === 'function_declaration' || exportChild.type === 'function_signature') {
          const nameNode = exportChild.childForFieldName('name');
          if (nameNode) {
            exports.push(`fn:${nameNode.text}`);
          }
        }
        // export class Name {}
        else if (exportChild.type === 'class_declaration') {
          const nameNode = exportChild.childForFieldName('name');
          if (nameNode) {
            exports.push(`class:${nameNode.text}`);
          }
        }
        // export const/let/var name = ...
        else if (exportChild.type === 'lexical_declaration' || exportChild.type === 'variable_declaration') {
          for (const decl of exportChild.children) {
            if (decl.type === 'variable_declarator') {
              const nameNode = decl.childForFieldName('name');
              if (nameNode) {
                exports.push(`var:${nameNode.text}`);
              }
            }
          }
        }
        // export type Name = ... (TypeScript only)
        else if (exportChild.type === 'type_alias_declaration') {
          const nameNode = exportChild.childForFieldName('name');
          if (nameNode) {
            exports.push(`type:${nameNode.text}`);
          }
        }
        // export interface Name {} (TypeScript only)
        else if (exportChild.type === 'interface_declaration') {
          const nameNode = exportChild.childForFieldName('name');
          if (nameNode) {
            exports.push(`interface:${nameNode.text}`);
          }
        }
        // export { a, b, c }
        else if (exportChild.type === 'export_clause') {
          for (const specChild of exportChild.children) {
            if (specChild.type === 'export_specifier') {
              const nameNode = specChild.childForFieldName('name');
              if (nameNode) {
                exports.push(`named:${nameNode.text}`);
              }
            }
          }
        }
        // export default
        else if (exportChild.type === 'identifier') {
          exports.push(`default:${exportChild.text}`);
        }
      }
    }
  }

  return exports;
}

// ============================================
// Python Import Extraction
// ============================================

/**
 * Extract all import statements from Python AST
 * Handles: import x, import x.y, from x import y, from .x import y
 */
function extractPythonImports(rootNode: Parser.SyntaxNode): ParsedImport[] {
  const imports: ParsedImport[] = [];

  function traverse(node: Parser.SyntaxNode) {
    // import module or import module as alias
    if (node.type === 'import_statement') {
      const parsed = parsePythonImportStatement(node);
      imports.push(...parsed);
    }
    // from module import name
    else if (node.type === 'import_from_statement') {
      const parsed = parsePythonFromImportStatement(node);
      if (parsed) {
        imports.push(parsed);
      }
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(rootNode);
  return imports;
}

/**
 * Parse Python import statement: import x, import x.y, import x as y
 */
function parsePythonImportStatement(node: Parser.SyntaxNode): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const child of node.children) {
    if (child.type === 'dotted_name') {
      // import module.submodule
      const moduleName = child.text;
      imports.push({
        source: moduleName,
        namedImports: [],
        defaultImport: moduleName,
        isRelative: false, // Regular Python imports are not relative
      });
    } else if (child.type === 'aliased_import') {
      // import x as y
      const dottedName = child.children.find(c => c.type === 'dotted_name');
      if (dottedName) {
        imports.push({
          source: dottedName.text,
          namedImports: [],
          defaultImport: dottedName.text,
          isRelative: false,
        });
      }
    }
  }

  return imports;
}

/**
 * Parse Python from...import statement: from x import y, from .x import y
 */
function parsePythonFromImportStatement(node: Parser.SyntaxNode): ParsedImport | null {
  let source = '';
  let isRelative = false;
  const namedImports: string[] = [];
  let defaultImport: string | null = null;

  for (const child of node.children) {
    // Module name
    if (child.type === 'dotted_name') {
      source = child.text;
    }
    // Relative import prefix
    else if (child.type === 'relative_import') {
      isRelative = true;
      // Get the dotted_name within relative_import if present
      const dottedName = child.children.find(c => c.type === 'dotted_name');
      if (dottedName) {
        source = dottedName.text;
      }
      // Count the dots for relative depth
      const dots = child.children.filter(c => c.type === 'import_prefix');
      if (dots.length > 0 && dots[0]) {
        const dotCount = dots[0].text.length;
        const prefix = '.'.repeat(dotCount);
        source = source ? `${prefix}${source}` : prefix;
      }
    }
    // Imported names
    else if (child.type === 'import_prefix') {
      // Leading dots for relative import
      isRelative = true;
      const dotCount = child.text.length;
      source = '.'.repeat(dotCount) + source;
    }
    else if (child.type === 'identifier') {
      namedImports.push(child.text);
    }
    else if (child.type === 'aliased_import') {
      const nameNode = child.children.find(c => c.type === 'identifier');
      if (nameNode) {
        namedImports.push(nameNode.text);
      }
    }
    else if (child.type === 'wildcard_import') {
      defaultImport = '*';
    }
  }

  if (!source && !isRelative) {
    return null;
  }

  // Ensure relative imports start with .
  if (isRelative && !source.startsWith('.')) {
    source = '.' + source;
  }

  return {
    source,
    namedImports,
    defaultImport,
    isRelative,
  };
}

// ============================================
// Python Export Extraction
// ============================================

/**
 * Extract all exports from Python AST
 * In Python, exports are typically module-level definitions not prefixed with _
 */
function extractPythonExports(rootNode: Parser.SyntaxNode): string[] {
  const exports: string[] = [];

  for (const child of rootNode.children) {
    // Function definition
    if (child.type === 'function_definition') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && !nameNode.text.startsWith('_')) {
        exports.push(`fn:${nameNode.text}`);
      }
    }
    // Async function definition
    else if (child.type === 'decorated_definition') {
      const funcDef = child.children.find(c =>
        c.type === 'function_definition' || c.type === 'class_definition'
      );
      if (funcDef) {
        const nameNode = funcDef.childForFieldName('name');
        if (nameNode && !nameNode.text.startsWith('_')) {
          const prefix = funcDef.type === 'function_definition' ? 'fn' : 'class';
          exports.push(`${prefix}:${nameNode.text}`);
        }
      }
    }
    // Class definition
    else if (child.type === 'class_definition') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && !nameNode.text.startsWith('_')) {
        exports.push(`class:${nameNode.text}`);
      }
    }
    // Variable assignment (module-level)
    else if (child.type === 'expression_statement') {
      const assignment = child.children.find(c => c.type === 'assignment');
      if (assignment) {
        const leftNode = assignment.children[0];
        if (leftNode?.type === 'identifier' && !leftNode.text.startsWith('_')) {
          exports.push(`var:${leftNode.text}`);
        }
      }
    }
    // Type alias (Python 3.12+)
    else if (child.type === 'type_alias_statement') {
      const nameNode = child.children.find(c => c.type === 'type');
      if (nameNode) {
        const identifier = nameNode.children.find(c => c.type === 'identifier');
        if (identifier && !identifier.text.startsWith('_')) {
          exports.push(`type:${identifier.text}`);
        }
      }
    }
  }

  // Check for __all__ definition (explicit exports)
  const allExports = findPythonAllExports(rootNode);
  if (allExports.length > 0) {
    // If __all__ is defined, use it as the primary export list
    return allExports.map(name => `all:${name}`);
  }

  return exports;
}

/**
 * Find __all__ list definition in Python module
 */
function findPythonAllExports(rootNode: Parser.SyntaxNode): string[] {
  const exports: string[] = [];

  for (const child of rootNode.children) {
    if (child.type === 'expression_statement') {
      const assignment = child.children.find(c => c.type === 'assignment');
      if (assignment) {
        const leftNode = assignment.children[0];
        if (leftNode?.type === 'identifier' && leftNode.text === '__all__') {
          // Found __all__ = [...]
          const rightNode = assignment.children.find(c => c.type === 'list');
          if (rightNode) {
            for (const item of rightNode.children) {
              if (item.type === 'string') {
                // Remove quotes
                const name = item.text.slice(1, -1);
                exports.push(name);
              }
            }
          }
        }
      }
    }
  }

  return exports;
}

// ============================================
// Content Parsing for Git Diff
// ============================================

/**
 * Parse content directly and extract export signature
 * Used for comparing git versions
 */
export function parseContentForExports(content: string, filePath: string): string {
  try {
    const language = setParserLanguage(filePath);
    if (!language) {
      return '';
    }

    const tree = parser.parse(content);

    let exports: string[];
    switch (language) {
      case 'typescript':
      case 'javascript':
        exports = extractJsExports(tree.rootNode);
        break;
      case 'python':
        exports = extractPythonExports(tree.rootNode);
        break;
      default:
        exports = [];
    }

    return simpleHash(exports.sort().join(','));
  } catch {
    return '';
  }
}

// ============================================
// Utility Functions
// ============================================

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
