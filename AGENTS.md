# AGENTS.md

## Project Overview

Siren is a "Project Management as Code" (PMaC) framework for defining projects and milestones using a concise HCL-inspired grammar. This repository is a TypeScript monorepo containing the core library, a CLI, and a small web app.

Key technologies
- TypeScript (tsconfig.json)
- Node.js 24+ runtimes
- Yarn 4 (Berry) workspaces
- Vitest for unit tests
- Tree-sitter grammar for parsing (packages/core/grammar)

Repository layout (high level)
- `packages/core/` — core parsing, IR, decoding, exporter logic
- `apps/cli/` — Node CLI and commands
- `apps/web/` — small Vite-based web front-end
- `siren/` — example `.siren` files and templates

## Required Setup

- Install Node.js 24.x (recommended)
- Install Yarn 4 (Berry) and enable workspace support
- From repo root, run:

```bash
yarn install
```

Notes
- Workspaces are used; prefer `yarn workspace <name> <script>` for package-scoped commands. Check each package `package.json` for the official package `name`.

## Common Commands

- Install dependencies: `yarn install`
- Run all tests from the repo root (recommended per package):
  - `yarn workspaces foreach -pv run test` OR run tests per workspace:
  - `yarn workspace <package-name> test`
- Run the CLI tests (example):
  - `yarn workspace @siren/cli test` (replace with actual package name from `apps/cli/package.json`)
- Run a single Vitest test by name:

```bash
# from package root (inside a workspace)
yarn test -t "pattern"
```

- Type-check TypeScript in a package:

```bash
yarn workspace <package-name> tsc --noEmit
```

## Development Workflow

- Make changes in the appropriate package under `packages/` or `apps/`.
- Add/update unit tests in the same package. Core changes that affect parsing/decoding must include fixtures under `packages/core/test/fixtures` per project conventions.
- Run `yarn install` when changing workspace dependencies.
- Use `yarn workspace <name> <script>` to run package-local scripts.

Monorepo tips
- To add a dependency to a single workspace, use `yarn workspace <name> add <pkg>` so other packages are unaffected.
- To run a script across all workspaces, use `yarn workspaces foreach -pv run <script>`.

## Testing Instructions

- Unit tests: Vitest is used across the repository. Look for `vitest.config.ts` files in packages.
- To run a focused test inside a package:

```bash
cd apps/cli
yarn test -t "Test Name Pattern"
```

- Core change testing rules (must follow):
  - Parser changes → add `snippets` fixtures under `packages/core/test/fixtures/snippets/`
  - IR changes → add `projects` fixtures under `packages/core/test/fixtures/projects/`
  - CLI behavior changes → add golden-file tests under `apps/cli/test/expected/`

Note that core must be rebuilt before any changes can be picked up by CLI tests.

## Code Style & Linting

- Language: TypeScript. Follow existing `tsconfig.json` settings.
- Use the repo's linting/formatting scripts if they exist (check `package.json` scripts). If none exist, follow standard TypeScript conventions used elsewhere in the repo.
- Keep `packages/core` portable: do not introduce DOM or Node-specific APIs into `packages/core`.

## Build & Release

- The core package is source-distributed and should remain environment-agnostic. Apps import `packages/core` as source via workspace linking (do not rely on pre-built core artifacts during local development).
- CLI builds (if configured) live under `apps/cli/` and use bundlers (tsup/esbuild per `apps/cli/tsup.config.ts`). Check each package's `package.json` for `build` scripts.

## Security & Secrets

- Do not commit secrets. If the project requires credentials for e2e tests or publishing, store them in the CI provider's secret store and reference them in workflow files.

## Where to Start for New Contributors

- Read `README.md` for a broad orientation.
- Run `yarn install` then `yarn workspaces foreach -pv run test` to see the current test baseline.
- To make a small change, pick an existing failing test or add a unit test in the focused package.

## Contact & Context

- The `siren/` directory contains example `.siren` files that are useful for testing and understanding the grammar and semantics.
- If you modify the parser or grammar, update the `packages/core/test/fixtures/` to capture the new behavior.

---

If you want, I can:
- run a focused test (specify package and test pattern),
- add an AGENTS.md tailored for a subpackage (e.g., `packages/core/AGENTS.md`), or
- open a PR with this file added.
