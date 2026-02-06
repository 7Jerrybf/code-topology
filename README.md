# Code Topology MVP

<div align="center">

**A local-first visual architecture analysis tool for developers**

*See dependencies. Detect risks. Understand your codebase at a glance.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## ✨ Features

- 🔍 **AST-based Analysis** — Leverages Tree-sitter for precise dependency extraction
- 🗺️ **Interactive Topology Graph** — Visualize your codebase structure with React Flow
- 🔀 **Git Diff Integration** — Detect changes between branches and identify breaking dependencies
- ⚡ **Local-First** — No databases, no cloud, no login. Everything runs on `localhost`
- 🎯 **Risk Detection** — Automatically highlight potentially broken dependencies

---

## 📸 Preview

> *Screenshot placeholder - run the app to see the topology graph*

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/code-topology-mvp.git
cd code-topology-mvp

# Install dependencies
pnpm install

# Analyze your codebase
pnpm run analyze

# Start the web viewer
pnpm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) to view the topology graph.

---

## 📖 Usage

### CLI Commands

```bash
# Analyze current directory
pnpm run analyze

# Analyze a specific path
pnpm run analyze -- /path/to/your/project

# Skip git diff analysis
pnpm run analyze -- --no-git

# Compare against a specific branch
pnpm run analyze -- --base develop
```

### Output

The CLI generates `topology-data.json` containing:
- **Nodes**: Files with type (FILE/COMPONENT/UTILITY) and status (UNCHANGED/ADDED/MODIFIED/DELETED)
- **Edges**: Dependencies between files with `isBroken` flag for risk detection

---

## 🏗️ Project Structure

```
code-topology-mvp/
├── cli/                 # Backend: AST parsing, Git operations, JSON generation
│   └── src/
│       ├── analyzer/    # Tree-sitter parsing core
│       ├── git/         # Git diff logic
│       └── index.ts     # CLI entry point
├── web/                 # Frontend: Topology visualization
│   └── src/
│       ├── app/         # Next.js pages
│       └── components/  # React Flow custom nodes
├── output/              # Generated topology data
└── CLAUDE.md            # AI agent configuration
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20+, TypeScript (Strict Mode) |
| **CLI** | Commander, Tree-sitter, simple-git |
| **Frontend** | Next.js 15, React Flow, dagre |
| **Package Manager** | pnpm (Monorepo) |

---

## 🗺️ Roadmap

- [x] **Phase 1**: AST parsing & CLI skeleton
- [x] **Phase 2**: Topology visualization with React Flow
- [x] **Phase 3**: Git diff & broken dependency detection
- [ ] **Phase 4**: AI-powered insights (LLM integration)
- [ ] **Phase 5**: VS Code extension

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 💡 Inspiration

This project aims to solve the "black box" problem in AI-assisted development. As AI generates code faster, developers lose visibility into the overall architecture. Code Topology brings that visibility back.

> *"If you can't see it, it doesn't exist."*
