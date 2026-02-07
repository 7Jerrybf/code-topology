# Custom Plugins

This directory is reserved for custom Language and Rule plugins.

## Language Plugin

To create a custom language plugin, implement the `LanguagePlugin` interface:

```typescript
import type { LanguagePlugin } from '@topology/core';

export const myPlugin: LanguagePlugin = {
  name: 'my-language',
  extensions: ['.mylang'],
  parse(content, filePath, basePath) {
    // Parse the file and return ParsedFile or null
    return null;
  },
  extractExportsFromContent(content, filePath) {
    // Return export signature string for diff comparison
    return '';
  },
};
```

Then register it:

```typescript
import { pluginRegistry } from '@topology/core';
pluginRegistry.register(myPlugin);
```

## Built-in Plugins

- **TypeScript/JavaScript** (.ts, .tsx, .js, .jsx, .mjs, .cjs)
- **Python** (.py)
