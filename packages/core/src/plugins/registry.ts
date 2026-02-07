/**
 * Plugin registry - manages language plugins
 */

import type { LanguagePlugin } from './types.js';

class PluginRegistry {
  private plugins: Map<string, LanguagePlugin> = new Map();
  private extensionMap: Map<string, LanguagePlugin> = new Map();

  /**
   * Register a language plugin
   */
  register(plugin: LanguagePlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered, overwriting.`);
    }

    this.plugins.set(plugin.name, plugin);

    for (const ext of plugin.extensions) {
      this.extensionMap.set(ext.toLowerCase(), plugin);
    }
  }

  /**
   * Get the plugin for a given file extension
   */
  getPluginForExtension(ext: string): LanguagePlugin | null {
    return this.extensionMap.get(ext.toLowerCase()) ?? null;
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name: string): LanguagePlugin | null {
    return this.plugins.get(name) ?? null;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): LanguagePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }
}

/** Global plugin registry singleton */
export const pluginRegistry = new PluginRegistry();
