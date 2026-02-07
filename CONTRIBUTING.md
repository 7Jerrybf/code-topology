# Contributing to Code Topology

Thank you for your interest in contributing! This document provides guidelines and steps for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Plugin Development](#plugin-development)

---

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all skill levels.

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm >= 9 (`npm install -g pnpm`)
- Git

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/code-topology.git
cd code-topology

# Install dependencies
pnpm install

# Build all packages (respects dependency order via Turborepo)
pnpm build

# Run the CLI analyzer
pnpm run analyze

# Start the web dev server
pnpm run dev:web
```

---

## Development Workflow

### Project Structure

This is a **Turborepo monorepo** with the following packages:

| Package | Directory | Purpose |
|---------|-----------|---------|
| `@topology/protocol` | `packages/protocol/` | Shared Zod schemas and type definitions |
| `@topology/core` | `packages/core/` | AST parsing, Git diff, graph building, plugin system |
| `@topology/server` | `packages/server/` | WebSocket server, file watcher |
| `@topology/web` | `packages/web/` | Next.js + React Flow visualization |
| `@topology/cli` | `cli/` | CLI interface (thin shell over core) |

**Build dependency order**: `protocol` -> `core` -> `server` -> `cli` / `web`

### Available Scripts

```bash
# Root level
pnpm install          # Install all dependencies
pnpm build            # Build all packages (via Turborepo)
pnpm run analyze      # Run CLI topology analysis
pnpm run dev:web      # Start web dev server (with dependencies)

# Individual packages
pnpm --filter @topology/core build
pnpm --filter @topology/web dev
pnpm --filter @topology/cli build
```

### Build System

We use **Turborepo** for incremental builds. The `turbo.json` config ensures packages are built in the correct dependency order. Always use `pnpm build` (which invokes `turbo build`) rather than building individual packages directly, unless you're sure all dependencies are already built.

---

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feat/amazing-feature`)
3. **Make changes** following our coding standards
4. **Build** to verify (`pnpm build`)
5. **Test** your changes locally
6. **Commit** with clear messages (`git commit -m 'feat: add amazing feature'`)
7. **Push** to your fork (`git push origin feat/amazing-feature`)
8. **Open a Pull Request** against `main`

### PR Topology Check

Pull requests automatically trigger a topology analysis that checks for broken dependencies and posts a report as a PR comment.

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Scopes** (optional): `core`, `web`, `cli`, `server`, `protocol`, `ci`

---

## Coding Standards

### TypeScript

- Use TypeScript strict mode (enforced by `tsconfig.base.json`)
- Avoid `any` type - use proper typing or `unknown`
- All data structures must align with schemas in `@topology/protocol`

### Architecture Rules

- **Schema Consistency**: Check `packages/protocol` before modifying data structures
- **Think in Graphs**: When adding a feature, consider how it affects the dependency graph
- **Performance**: Target repos with 10k+ files - avoid O(N^2) algorithms in hot paths
- **Modularity**: Keep Core logic decoupled from UI - Core must run in headless CI environments

### Error Handling

- CLI: Use `console.warn` and skip files on parse errors (never crash the analyzer)
- Web: Show friendly messages if data is missing or malformed

### Style

- Follow existing code patterns
- Use functional React components with hooks
- Write meaningful variable names

---

## Plugin Development

Code Topology supports language plugins to extend AST parsing to new languages.

### Creating a Language Plugin

Implement the `LanguagePlugin` interface from `@topology/core`:

```typescript
import type { LanguagePlugin } from '@topology/core';

export const myLanguagePlugin: LanguagePlugin = {
  name: 'my-language',
  extensions: ['.mylang'],
  parseImports(content: string, filePath: string) {
    // Return array of import specifiers
    return [];
  },
  parseExports(content: string, filePath: string) {
    // Return array of export specifiers
    return [];
  },
};
```

Built-in plugins for TypeScript/JavaScript and Python are located in `packages/core/src/plugins/built-in/`.

---

## Ideas for Contributions

- [ ] Add language support (Go, Java, Rust, C#)
- [ ] Improve graph layout algorithms
- [ ] Add unit tests for core parsing logic
- [ ] Create VS Code extension
- [ ] Implement MCP Server for AI agent integration
- [ ] Add circular dependency detection rules
- [ ] Performance benchmarks for large repositories

---

## Questions?

Feel free to open an [issue](https://github.com/7Jerrybf/code-topology/issues) for questions or discussions!
