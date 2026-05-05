# AGENTS.md

## Project Overview

Siren is a "Project Management as Code" (PMaC) framework for defining projects and milestones using a concise HCL-inspired grammar. This repository is a TypeScript monorepo containing the core library, the language package (parser/decoder/exporters), a CLI, and a small web app.

Key technologies
- TypeScript (tsconfig.json)
- Node.js 24+ runtimes
- Yarn 4 (Berry) workspaces
- Vitest for unit tests
- Tree-sitter grammar for parsing (`packages/language/grammar`)

Repository layout (high level)
- `packages/core/` — IR types, semantic validation, `DiagnosticBase`, `IRExporter` interface, utilities (env-agnostic)
- `packages/language/` — tree-sitter grammar, parser factory, CST → IR decoder, exporters/formatters
- `apps/cli/` — Node CLI and commands
- `apps/web/` — small Vite-based web front-end
- `siren/` — example `.siren` files and templates

## Project Status

The project is prerelease and the API changes regularly, reflecting its 0.x semver posture.
The API surface changes regularly, new package separations are introduces, and the ownership of different facets
of the ecosystem shifts across package lines.

Breaking changes are not currently a heuristic to avoid. The goal is to enable the utility to be useful, while
retaining a critically simple and maintainable architecture in this early phase.

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
  - `yarn workspace @sirenpm/cli test` (replace with actual package name from `apps/cli/package.json`)
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
  - Grammar/parser changes → add `snippets` fixtures under `packages/language/test/fixtures/snippets/`
  - Decoder/IR changes → add `projects` fixtures under `packages/language/test/fixtures/projects/` (or core IR unit tests when purely semantic)
  - CLI behavior changes → add golden-file tests under `apps/cli/test/expected/`

Note that, when iterating across packages, downstream consumers must be rebuilt before changes are picked up. The CLI consumes `@sirenpm/core` and `@sirenpm/language` via npm pins, not workspace links — see Build & Release below.

## Code Style & Linting

- Language: TypeScript. Follow existing `tsconfig.json` settings.
- Use the repo's linting/formatting scripts if they exist (check `package.json` scripts). If none exist, follow standard TypeScript conventions used elsewhere in the repo.
- Keep `packages/core` portable: do not introduce DOM or Node-specific APIs into `packages/core`.

## Build & Release

- The core package (`packages/core`, `@sirenpm/core`) is bundled with tsup into a single ESM module (`dist/index.js`) plus types (`dist/index.d.ts`). Core source must remain environment-agnostic (no DOM or Node APIs) so the bundle runs in both browser and Node hosts. Core has **no** parser/decoder/export code.
- The language package (`packages/language`, `@sirenpm/language`) owns the tree-sitter grammar (with the committed `tree-sitter-siren.wasm`), parser factory (`createParser()`), decoder, and exporters. `web-tree-sitter` is a direct runtime dep. Depends on `@sirenpm/core` as a peer dep.
- The CLI (`apps/cli`, `@sirenpm/cli`) depends on `@sirenpm/core` and `@sirenpm/language` from the npm registry, not via workspace links. Normal builds consume the published packages. `enableTransparentWorkspaces: false` in `.yarnrc.yml` enforces this: only deps declared with the `workspace:` protocol resolve locally.
- Developers iterating across packages must link manually (e.g. `yarn link` or temporarily swap a dep to `workspace:*`).
- The web app (`apps/web`) uses `workspace:*` because it is not published.
- CLI builds live under `apps/cli/` and use tsup (`apps/cli/tsup.config.ts`).

## Security & Secrets

- Do not commit secrets. If the project requires credentials for e2e tests or publishing, store them in the CI provider's secret store and reference them in workflow files.

## Where to Start for New Contributors

- Read `README.md` for a broad orientation.
- Run `yarn install` then `yarn workspaces foreach -pv run test` to see the current test baseline.
- To make a small change, pick an existing failing test or add a unit test in the focused package.

## Contact & Context

- The `siren/` directory contains example `.siren` files that are useful for testing and understanding the grammar and semantics.
- If you modify the parser or grammar, update the fixtures under `packages/language/test/fixtures/` to capture the new behavior.

---

If you want, I can:
- run a focused test (specify package and test pattern),
- add an AGENTS.md tailored for a subpackage (e.g., `packages/core/AGENTS.md`), or
- open a PR with this file added.
