CONTRIBUTORS
============

This document explains the repository layout, developer standards, and common commands for contributors.

Repository layout
-----------------

- `packages/core` — Core IR types, semantic validation, `SirenBuilder`, `SirenProject`, and shared utilities. Must remain environment-agnostic (no DOM/Node APIs).
- `packages/language` — Tree-sitter grammar, parser factory, CST → IR decoder, exporters, and formatters.
- `packages/language/grammar` — Tree-sitter grammar sources plus the committed WASM binary used by tests and apps.
- `apps/cli` — Node CLI (bundled with `tsup`/`esbuild`).
- `siren/` — bootstrapped siren project tracking development progress and goals.

Developer conventions
---------------------

- TypeScript throughout. Keep public APIs stable and well-typed.
- No `any` in core packages: use discriminated unions and type guards.
- Keep `packages/core` portable: hide environment-specific loading behind `ParserAdapter` implementations.
- Tests use Vitest. Use per-package workspace test commands.

Building & testing
-------------------

Install dependencies:

```bash
yarn install
```

Run all tests:

```bash
yarn test
```

Why we run a root build before tests
-----------------------------------

The root `test` script runs `yarn build:quiet` before the workspace test sweep.
This ensures workspace packages' compiled `dist` artifacts are up to date when tests
import package entrypoints (many packages export their runtime from `dist`). Running
tests without building can cause suites to load stale built files and fail unpredictably
depending on the `workspaces foreach` scheduling. The root `test` script makes `yarn test`
deterministic by building first.

Run core package tests:

```bash
yarn workspace @sirenpm/core test
```

Rebuild the Tree-sitter parser (only needed when editing grammar):

```bash
cd packages/language/grammar
npx tree-sitter-cli generate
npx tree-sitter-cli build --wasm
npx tree-sitter-cli test
```

How to add features
--------------------

1. Open an issue describing the change and the acceptance criteria.
2. Add or update unit tests in the appropriate package.
3. Grammar/parser changes should add a focused snippet fixture under `packages/language/test/fixtures/snippets/`.
4. Decoder or IR changes should add a focused project fixture under `packages/language/test/fixtures/projects/` (or core IR unit tests when the change is purely semantic).
5. CLI behavior changes should add a golden-file test under `apps/cli/test/expected/`.
6. Implement the change with minimal, focused edits.
7. Run the package tests and update fixtures as needed.

Code style & reviews
--------------------

- Keep PRs small and focused. Include test coverage for behavioral changes.
- Preserve public API shapes unless the change is explicitly part of a major version bump.
- Before merging: run `yarn build`, `yarn test`.

Continuous integration
----------------------

CI runs three baseline jobs against the registry-pinned dependency graph (the
same graph end users install): `test`, `lint`, and `grammar-drift`. Once those
pass, an `integration` job re-runs the build and full test suite with every
`@sirenpm/*` dependency rewritten to the `workspace:*` protocol so sibling
packages resolve to local sources. This catches breaking API or type changes
between `core`, `language`, and `cli` that the registry-pinned baseline would
silently mask.

To reproduce the integration job locally:

```bash
bash .github/workflow-utils/swap-to-workspace-protocol.sh
yarn install   # lockfile will diverge; do not commit
yarn build
yarn test
```

Restore the originals with `git checkout -- apps/cli/package.json packages/language/package.json yarn.lock` when done.

Fixtures
--------

- Purpose: Fixtures are representative `.siren` inputs and golden outputs used by unit and integration tests to validate parsing, decoding, and behavior of clients (CLI, web, etc).
- Common locations:
	- `packages/core/test/fixtures/snippets/` — small grammar examples for parser tests
	- `packages/core/test/fixtures/projects/` — project fixtures used by decoding/integration tests
	- `apps/cli/test/expected/` — golden stdout/stderr outputs for CLI tests
	- `apps/cli/test/helpers/fixture-utils.ts` — helpers for copying and preparing fixtures in tests
- Usage: When adding a grammar/decoder change, add a small, focused fixture that reproduces the case and a test referencing it. For golden file changes, update the expected output and ensure tests reflect the new behavior.
- Best practices: keep fixtures minimal and well-named, include comments when needed, add a matching test, and prefer multiple small fixtures over one large file.

Public API Policy (SirenBuilder / SirenProject)
----------------------------------------------

- **Goal:** expose a minimal, object-oriented surface via `SirenBuilder` and `SirenProject`. Consumers (CLI, web, external) should interact with the project IR only through `SirenProject` methods and exported types.
- **What to export:** the `packages/core` public entry currently exports `SirenBuilder`, `SirenProject`, the IR types, diagnostics, `IRExporter`, selected helpers, and type guards. Keep new helpers internal unless there is a concrete consumer need.
- **Immutability & encapsulation:** `SirenProject` instances are immutable and return plain data. Methods should avoid leaking internal mutable structures and should be the documented way for clients to query the IR (for example `findResourceById()`, `getMilestoneIds()`, `getTasksByMilestone()`, `getDependencyTree()`, and `diagnostics`).
- **Testing guidance:**
	- Integration and external tests should exercise behavior via the `SirenProject` API only.
	- Internal unit tests within `packages/core` may import package-local modules (for example `src/ir/types.ts` or `src/utilities/*`) to verify low-level behavior. Those imports must remain inside the package and should not be considered part of the public contract.
- **CLI/Web integration:** when adding CLI commands or web features, prefer wiring the command handlers to methods on `SirenProject` (CLI commands should mirror object methods). This keeps the CLI usage and programmatic API aligned.
- **Evolving internals:** keep utilities and helpers private so the core implementation can change without breaking consumers. When a new capability is intended for consumers, add a well-documented method to `SirenProject` and update callers.
