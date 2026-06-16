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

Run core package tests:

```bash
yarn workspace @sirenpm/core test
```

Rebuild the Tree-sitter parser (only needed when editing grammar):

```bash
cd packages/language/src/grammar
yarn generate
yarn build
yarn test
```

How to add features
--------------------

1. Open an issue describing the change and the acceptance criteria.
2. Add or update unit tests in the appropriate package.
3. Grammar/parser changes should add a focused fixture to the corpus under `packages/language/src/grammar/test/corpus/`.
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

Testing Standards & Conventions
-------------------------------

### Test runner & configuration

- **Vitest** is the test runner across the entire monorepo. Each workspace has its own `vitest.config.ts`.
- All tests run in a **Node environment** (`environment: 'node'`). No browser/jsdom environment is used.
- The root `vitest.config.ts` uses the `projects` pattern to run each workspace (`packages/*`, `apps/cli`) as an isolated Vitest project with its own config.
- Coverage is configured with **v8 provider** and **text + lcov reporters** in `packages/core` and `packages/language`. No explicit coverage thresholds are set in config (enforced by CI where needed).
- Build metadata (`PACKAGE_VERSION`, `BUILD_METADATA`) is injected at compile-time via `define` in `vitest.config.ts` — tests that assert version strings should use this rather than hardcoding.

### Test file organization

- All test files use the `*.test.ts` suffix (never `.spec.ts`).
- **Co-located tests**: Tests for a module live next to the source file (`src/index.test.ts` next to `src/index.ts`). This is the default pattern.
- **Separate test directory**: Integration, golden, and fixture-heavy tests live in a `test/` directory at the package root (e.g., `packages/core/test/`, `apps/cli/test/`).
- **Single responsibility per file**: Each test file targets one module or concern. File-level doc comments document the boundary explicitly (see "Test boundary comments" below).

### Test structure

- Use the BDD `describe` / `it` / `expect` pattern. Do not use `test()` blocks.
- `describe` blocks describe the module or behavior under test. Use nested `describe` for logical groupings.
- `it` blocks describe a single behavioral assertion in present tense ("returns X when Y").
- Use Vitest's built-in matchers: `toBe`, `toEqual`, `toHaveProperty`, `toBeInstanceOf`, `toContain`, `toHaveLength`, `toBeGreaterThan`, `resolves`, `rejects`. **No custom matchers** are defined.
- Prefer `toEqual` for deep equality and `toBe` for primitives/references.
- No `any` in test code in core packages — use explicit types and type guards.

**Example structure:**

```typescript
import { describe, expect, it } from 'vitest';
import { ModuleUnderTest } from '../src/path';

describe('ModuleUnderTest', () => {
  it('returns expected value for given input', () => {
    const result = ModuleUnderTest.run(input);
    expect(result).toEqual(expected);
  });
});
```

### Helper & factory patterns

- **Inline factory functions**: Tests define small factory helpers at the top of the file rather than relying on shared test utilities or global setup. This keeps each test file self-contained and readable.

```typescript
// Typical entry factory used across core tests
function makeTask(id: string): SirenEntry {
  return { type: 'task', id, attributes: [] };
}

function entry(
  type: EntryType,
  id: string,
  opts?: { status?: EntryStatus; dependsOn?: string[] },
): SirenEntry {
  // ...build entry with optional attributes
}
```

- **No global setup files** (`setupFiles` in vitest config). Shared test utilities are imported explicitly where needed.
- **CLI test helpers** live in `apps/cli/test/helpers/`:
  - `fixture-utils.ts` — `copyProjectFixture(name)` copies a project fixture to a temp directory
  - `fs-assert.ts` — `assertDirMatchesExpected()`, `listFiles()`, `readFileNormalized()` for directory-level golden assertions

### Spy & mock conventions

- Use `vi.spyOn` with `mockImplementation` for spying on console output, `process.cwd`, etc. Always restore in a `try/finally` block.

```typescript
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
try {
  await main(args);
  // ...assert logSpy.mock.calls
} finally {
  logSpy.mockRestore();
  errSpy.mockRestore();
}
```

- Do not use global mock declarations or `vi.mock` at the module level unless absolutely necessary for environment shims.

### Temp directory lifecycle

- Tests that operate on the filesystem create temporary directories with `fs.mkdtempSync` (or `fs.promises.mkdtemp`) and clean them up in `afterEach`.

```typescript
let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

- CLI golden tests use `copyProjectFixture()` which handles temp directory creation internally.

### Golden file format (CLI tests)

Golden files in `apps/cli/test/expected/` follow a structured format:

```
{ "fixture": "<fixture-name>", "command": "siren <subcommand> [args]" }
---
<stdout content>
---
<stderr content>
```

- **Line 1**: JSON metadata with `fixture` (references a project fixture name) and `command` (the full CLI invocation).
- **Delimiter**: A line of three or more hyphens (`---`) separates metadata from content.
- **Second delimiter**: Another `---` separates stdout from stderr.
- The golden test runner (`apps/cli/test/golden.test.ts`) parses this format, substitutes version placeholders (`{{coreVersion}}`, `{{cliVersion}}`), and asserts output matches exactly.
- Lines starting with `#` in expected output are treated as comments and stripped during comparison.
- Two golden file variants exist:
  1. **Directory-level** (`expected/<name>/.out.txt`): Asserts both stdout/stderr output and the resulting project directory structure.
  2. **Flat** (`expected/<name>.txt` or `.out.txt`): Asserts only stdout/stderr output.

### Test boundary comments

Test files that target a specific module include a doc comment at the top scoping the file's responsibility. This prevents scope creep and makes test coverage gaps obvious:

```typescript
/**
 * TEST BOUNDARY:
 * This module is exclusively for testing the `SirenBuilder` mutation APIs and
 * delta computations (`.patch()`, `withEntry()`, etc.).
 *
 * Construction, compilation (`.build()`), diagnostics generation, and initial
 * ephemeral identity stamping concerns belong in `assembly.test.ts`.
 */
```

Follow this pattern when creating new test files: declare what the file tests — and, crucially, what it does **not** test.

### What not to test

- **Do not write tests that assert structure.** Structural properties (field shapes, union discrimination, optionality, readonlyness) are enforced by the TypeScript type system. A test that checks whether a type has a certain field adds noise without catching runtime failures.
- **Do not write tests that "check" the type system.** Tests execute at runtime — they cannot verify that a type error is raised, that a generic resolves correctly, or that a union discriminant narrows properly. Tests exercise the compiled JavaScript output, not the TypeScript compiler.
- **Prefer runtime behavior assertions.** Instead of asserting that a function returns an object with a specific shape, invoke the function with inputs and assert on the runtime output values it produces for those inputs.

### Coverage expectations

- Run `yarn test` locally before pushing to check for regressions.
- Coverage is reported in CI (text + lcov). Strive to cover new code paths, but there are no hard thresholds in config.
- When fixing a bug, write a test that reproduces the bug *before* applying the fix, then verify the fix makes the test pass (test-driven debugging).

### Checklist for adding tests

When contributing a change, verify each applicable item:

- [ ] Grammar/parser change → new corpus scenario added to `packages/language/src/grammar/test/corpus`
- [ ] Decoder/IR change → project fixture added under `packages/language/test/fixtures/projects/` (and `packages/core/test/fixtures/projects/`)
- [ ] CLI behavior change → golden file added under `apps/cli/test/expected/`
- [ ] Core semantic change → core unit test(s) added in `packages/core/test/`
- [ ] Bug fix → test that reproduces the bug added before the fix
- [ ] Test file has a boundary comment if it targets a narrow module
- [ ] All existing tests pass (`yarn test` from root)

Fixtures
--------

- Purpose: Fixtures are representative `.siren` inputs and golden outputs used by unit and integration tests to validate parsing, decoding, and behavior of clients (CLI, web, etc).
- Common locations:
	- `packages/language/src/grammar/test/corpus/` — small focused grammar examples and CST snapshots for observability into parser behavior
	- `packages/language/test/fixtures/projects/` — full project fixtures used by decoder, integration, and CLI tests
	- `packages/core/test/fixtures/projects/` — duplicate of `packages/language/test/fixtures/projects/` (see duplication note below)
	- `apps/cli/test/expected/` — golden stdout/stderr outputs for CLI tests
	- `apps/cli/test/helpers/` — shared test utilities (`fixture-utils.ts`, `fs-assert.ts`)
- Usage: When adding a grammar/decoder change, add a small, focused fixture that reproduces the case and a test referencing it. For golden file changes, update the expected output and ensure tests reflect the new behavior.
- Best practices: keep fixtures minimal and well-named, include comments when needed, add a matching test, and prefer multiple small fixtures over one large file.
- Duplication note: project fixtures are duplicated between `packages/core/test/fixtures/projects/` and `packages/language/test/fixtures/projects/` (not symlinked, for cross-platform compatibility). The language tree is canonical. **Edits to a fixture must be applied in both trees** until the duplication is eliminated.

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
