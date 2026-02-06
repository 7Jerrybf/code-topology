# Contributing to Code Topology MVP

Thank you for your interest in contributing! This document provides guidelines and steps for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all skill levels.

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Git

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/code-topology-mvp.git
cd code-topology-mvp

# Install dependencies
pnpm install

# Run the CLI
pnpm run analyze

# Start the web dev server
pnpm run dev:web
```

---

## Development Workflow

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `cli/` | Backend CLI - AST parsing, Git operations |
| `web/` | Frontend - React Flow visualization |
| `output/` | Generated topology data |

### Available Scripts

```bash
# Root level
pnpm install          # Install all dependencies
pnpm run analyze      # Run CLI analyzer

# Web
cd web
pnpm run dev          # Start Next.js dev server
pnpm run build        # Build for production

# CLI
cd cli
pnpm run build        # Compile TypeScript
```

---

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/amazing-feature`)
3. **Make changes** following our coding standards
4. **Test** your changes locally
5. **Commit** with clear messages (`git commit -m 'feat: add amazing feature'`)
6. **Push** to your fork (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

---

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` type (except for complex AST nodes with comments)
- Use functional components with hooks for React

### Error Handling

- CLI: Use `console.warn` and skip files on parse errors (never crash)
- Web: Show friendly "No Data Found" message if JSON is missing

### Style

- Use ESLint and Prettier
- Follow existing code patterns
- Write meaningful variable names

---

## 💡 Ideas for Contributions

- [ ] Add support for more languages (JavaScript, Python, Go)
- [ ] Improve graph layout algorithms
- [ ] Add dark/light theme toggle
- [ ] Create VS Code extension
- [ ] Add AI-powered explanations for broken dependencies

---

## Questions?

Feel free to open an issue for questions or discussions!
