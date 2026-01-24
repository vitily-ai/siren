CONTRIBUTORS
============

This document explains the repository layout, developer standards, and common commands for contributors.

Repository layout
-----------------

- `packages/core` — Core parsing, decoding, IR types, utilities. Must remain environment-agnostic (no DOM/Node APIs).
- `packages/core/grammar` — Tree-sitter grammar and committed WASM binary used by tests and apps.
- `apps/web` — Vite web frontend (WASM + Mermaid rendering).
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

Run core package tests:

```bash
yarn workspace @siren/core test
```

Rebuild the Tree-sitter parser (only needed when editing grammar):

```bash
cd packages/core/grammar
npx tree-sitter-cli generate
npx tree-sitter-cli build --wasm
npx tree-sitter-cli test
```

How to add features
--------------------

1. Open an issue describing the change and the acceptance criteria.
2. Add or update unit tests in the appropriate package (`packages/core/test`, `apps/cli/test`, or `apps/web/src` tests).
3. Implement the change with minimal, focused edits.
4. Run the package tests and update fixtures as needed.

Code style & reviews
---------------------

- Keep PRs small and focused. Include test coverage for behavioral changes.
- Preserve public API shapes unless the change is explicitly part of a major version bump.
- Before merging: run `yarn build`, `yarn test`.

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
