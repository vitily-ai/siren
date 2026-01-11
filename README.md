# Siren

> **Project Management as Code** — Define projects as atomic milestones using an HCL-inspired grammar.

[![CI](https://github.com/USERNAME/siren/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/siren/actions/workflows/ci.yml)

## Quick Start

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Start web dev server
yarn workspace @siren/web dev

# Run CLI
node apps/cli/dist/index.js
```

## Structure

- **`packages/core`** — Environment-agnostic parsing, validation, IR, Mermaid emission
- **`apps/web`** — Vite-based browser app
- **`apps/cli`** — Node CLI (tsup/esbuild)

## Requirements

- Node.js ≥ 24
- Yarn 4 (Berry) — enabled via Corepack

## License

GPL-3.0 Project Management

## Goals
* Create a framework for defining and managing projects in terms of discrete atomic milestones
* Entirely text-based, "Project Management as Code (PMaC)" that integrates seamlessly with version control, living alongside codebases
* Robust interpreted HCL-inspired grammar that is flexible, error-tolerant, recoverable, and composable
* Resources parsed into intermediate representation, which supports multiple backends
    * MermaidJS-based browser target, prioritizing an intuitive grokkable UX
    * CLI target, for porcelain programmatic access
* Enable "plan-once" paradigm providing familiar UX for managers, intuitive developer-first maintenance, and context efficiency for autonomous LM agents
* Rapid incrementation with feedback via JIT rendering without a separate compilation step

## Stack
* JIT interpretation, deploy the whole bundle alongside configuration
* **Monorepo & orchestration**: Use a workspace-based monorepo (pnpm/yarn/npm workspaces) as the top-level orchestrator. Root scripts coordinate builds and tests; add Turborepo or Nx later if you need dependency-aware caching and parallelization. Avoid a heavy “global” build tool; a `justfile` is optional as a thin UX wrapper, not the primary system.

* **Core library**: Keep all parsing, decoding, semantic validation, and Mermaid emission in a `packages/core` workspace. Author it as environment-agnostic TypeScript with no DOM or Node dependencies. Consume it as source via workspace linking; only produce bundled artifacts when publishing or distributing it independently.

* **Parsing backend**: Use Tree-sitter for error-tolerant parsing in the browser and Node (via WASM). Hide environment-specific loading behind an interface, with browser and Node adapters so the core logic remains portable and testable.

* **Web app**: Build the browser app with Vite for fast dev and WASM-friendly bundling. Import the core library via workspace linkage and treat Mermaid purely as a rendering backend.

* **CLI**: Build the Node CLI with a CLI-focused bundler (tsup/esbuild or Rollup). Share the same core library and semantic model as the web app; do not reimplement parsing or validation logic.

* **Testing**: Use Vitest repo-wide for unit tests, even in packages that do not use Vite for bundling. Configure per-package environments (`node` for core/CLI, `jsdom` or similar for web). Add Playwright only for browser end-to-end tests where real rendering and WASM loading matter.

* **Build outputs**: Do not pre-build the core library for internal consumption. Let each app compile it as part of its own build. Build and publish core artifacts only when releasing it as a standalone package.

* **Licensing & distribution**: License the open project under GPLv3. Run the web app as a hosted service without triggering copyleft, and offer a separate commercial license for distributed or embedded enterprise deployments.


## POC
Project should be able to "bootstrap" itself by defining its own milestones