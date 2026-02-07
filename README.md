# Code Topology

<div align="center">

**The GPS for AI-Native Development.**

*Visualize, navigate, and govern your codebase architecture through an interactive topology graph.*

[![CI](https://github.com/7Jerrybf/code-topology/actions/workflows/ci.yml/badge.svg)](https://github.com/7Jerrybf/code-topology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## What is Code Topology?

As AI generates code faster than ever, developers lose visibility into overall architecture. Code Topology solves this by parsing your codebase with **Tree-sitter AST analysis**, building a **dependency graph**, and rendering it as an interactive topology map.

### Key Features

- **Multi-language AST Parsing** - TypeScript, JavaScript, Python (extensible via plugin system)
- **Interactive Topology Graph** - Powered by React Flow + elkjs layout engine
- **Git Diff Awareness** - Highlights added, modified, and deleted nodes based on branch comparison
- **Broken Dependency Detection** - Flags imports that reference missing or deleted modules
- **Real-time Watch Mode** - WebSocket-powered live updates on file changes
- **Timeline & Snapshots** - Track how your architecture evolves across commits
- **Report Generation** - Export analysis as Markdown or JSON for CI integration
- **Plugin System** - Extend language support with custom Tree-sitter plugins
- **Local-First** - No databases, no cloud, no login. Everything runs on localhost

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/7Jerrybf/code-topology.git
cd code-topology

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Analyze the current directory
pnpm run analyze

# Start the web visualizer
pnpm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) to view the topology graph.

---

## CLI Usage

```bash
# Analyze current directory (outputs to packages/web/public/data/topology-data.json)
pnpm run analyze

# Analyze a specific path
node cli/dist/index.js analyze /path/to/project

# Compare against a specific branch
node cli/dist/index.js analyze . --base develop

# Watch mode - live updates via WebSocket
node cli/dist/index.js watch . --port 8765

# Generate a Markdown report
node cli/dist/index.js analyze . --report markdown --output-report report.md

# History mode - append snapshots for timeline
node cli/dist/index.js analyze . --history --snapshot-label "v1.0"

# CI gate - fail if broken dependencies exceed threshold
node cli/dist/index.js analyze . --fail-on-broken 0
```

---

## Project Structure

```
code-topology/
├── packages/
│   ├── protocol/       # @topology/protocol - Zod schemas (Single Source of Truth)
│   ├── core/           # @topology/core - AST parsing, Git diff, graph building, plugins
│   │   └── src/
│   │       ├── parser/     # Tree-sitter multi-language parsing
│   │       ├── graph/      # Topology graph building & snapshots
│   │       ├── git/        # Git diff analysis
│   │       ├── reporter/   # Report generation (Markdown/JSON)
│   │       ├── plugins/    # Language plugin system + built-in plugins
│   │       └── analyze.ts  # High-level analysis API
│   ├── server/         # @topology/server - WebSocket server, file watcher
│   └── web/            # @topology/web - Next.js + React Flow visualization
├── cli/                # @topology/cli - CLI interface (thin shell over core)
├── plugins/            # Custom plugin directory (reserved)
├── turbo.json          # Turborepo build configuration
└── pnpm-workspace.yaml # Workspace definition
```

**Build DAG**: `protocol` -> `core` -> `server` -> `cli` / `web`

---

## Architecture

The system follows a **Modular Monolith** pattern with four layers:

| Layer | Package | Responsibility |
|-------|---------|----------------|
| **L1: Core Engine** | `@topology/core` | AST parsing via Tree-sitter, Git diff, dependency graph construction, plugin loader |
| **L2: Protocol** | `@topology/protocol` | Shared Zod schemas and type definitions |
| **L3: Server** | `@topology/server` | WebSocket event stream, file system watcher |
| **L4: Interface** | `@topology/web` | React Flow canvas, search, filter, timeline, dark/light themes |

### Tech Stack

| Category | Technology |
|----------|------------|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Language** | TypeScript 5.x (strict mode) |
| **Parsing** | Tree-sitter (multi-language) |
| **Graph Layout** | elkjs |
| **Schema** | Zod (runtime validation) |
| **Frontend** | Next.js 15, React Flow, Tailwind CSS, Zustand |
| **CLI** | Commander |

---

## Roadmap

- [x] **Phase 1 - The Viewer** (MVP): AST parsing, graph visualization, CLI, plugin system, report generation
- [ ] **Phase 2 - The Monitor**: Local SQLite cache, vector embeddings for semantic links
- [ ] **Phase 3 - The Arbiter**: MCP Server for AI agents, conflict detection across branches
- [ ] **Phase 4 - The Governor**: RBAC, cloud sync, visual rule builder

See [CLAUDE.md](CLAUDE.md) for the full technical roadmap and data contracts.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

> *"In the age of AI-generated code, the map is more important than the territory."*
