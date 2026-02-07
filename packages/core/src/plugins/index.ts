/**
 * Plugin system for language extensions
 */

export { pluginRegistry } from './registry.js';
export { type LanguagePlugin, type ParsedFile, type ParsedImport } from './types.js';
export { typescriptPlugin } from './built-in/typescript.js';
export { pythonPlugin } from './built-in/python.js';

// Auto-register built-in plugins
import { pluginRegistry } from './registry.js';
import { typescriptPlugin } from './built-in/typescript.js';
import { pythonPlugin } from './built-in/python.js';

pluginRegistry.register(typescriptPlugin);
pluginRegistry.register(pythonPlugin);
