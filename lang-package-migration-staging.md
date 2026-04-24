# Language Package Migration — Staging Doc

This file tracks working code removed from `@sirenpm/core` during Release 1 that must be re-introduced in later releases. See `lang-package-plan.md` for context. Delete this file at the end of Release 4.

## Release 2 port targets

_Populated during Release 1 Phase 1.3 and 1.4._

**`Origin` canonical location (Phase 1.2):** `Origin` now lives in `packages/core/src/ir/types.ts`. When Phase 2.2 restores `packages/language/src/parser/cst.ts`, its `Origin` import must resolve to `@sirenpm/core`, not a local redeclaration.

### Parser sources (Phase 1.3)

Removed from `packages/core/src/parser/`. Restore into `packages/language/src/parser/` in Phase 2.2.

Source files:
- `adapter.ts` — defines `ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, `CommentToken`.
- `cst.ts` — CST node types (`DocumentNode`, `ResourceNode`, `AttributeNode`, `ExpressionNode`, `LiteralNode`, `ReferenceNode`, `ArrayNode`, `IdentifierNode`, `CSTNode`). `Origin` is no longer declared here — import from `@sirenpm/core`.
- `factory.ts` — current DI-flavored `createParserFactory` with `ParserFactoryInit`, `ParserLike`, `LanguageLike`, `loadWasm`. **Rewrite in Phase 2.2** per plan item 22: delete the DI types; import `Parser` and `Language` from `web-tree-sitter` directly; expose a zero-config `createParser()` that runs `Parser.init()` + `Language.load()` internally and returns a `ParserAdapter`; resolve grammar WASM via `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)`.
- `source-index.ts` — `SourceIndex`, `ClassifiedComment`. Currently imports `Origin` from `./cst` (which re-exports from core); in the new package import `Origin` from `@sirenpm/core` directly.
- `index.ts` — barrel re-exporting the above.

Colocated tests (move to `packages/language/test/` / colocated under `packages/language/src/parser/` per Phase 2.4):
- `adapter.test.ts`
- `cst.test.ts`
- `source-index.test.ts`

### Decoder sources (Phase 1.3)

Removed from `packages/core/src/decoder/`. Restore into `packages/language/src/decoder/` in Phase 2.3.

Source files:
- `index.ts` — `decodeDocument`, `ParseDiagnostic`, language-phase diagnostic emission.
- `xfail.ts` — expected-failure metadata used by decode fixtures.

Colocated test:
- `index.test.ts`

**Diagnostic code rename map (apply in Phase 2.3):**

| Old code (in core) | New code (in language) |
|---|---|
| `W001` (parse warning) | `WL001` |
| `W002` (parse warning) | `WL002` |
| `W003` (parse warning) | `WL003` |
| `E001` (parse error)   | `EL001` |

Core semantic codes `W001`–`W003` are already reclaimed (Phase 1.1); the `WL`/`EL` prefix avoids collisions when both packages are loaded.

**Import rewrites:** the current decoder imports IR types from `../ir/index` — in the new package switch to `@sirenpm/core`. CST type imports stay local (`../parser/cst`).

### Export sources (Phase 1.3)

Removed from `packages/core/src/export/`. Restore into `packages/language/src/export/` in Phase 2.3.

Source files:
- `siren-exporter.ts` — `exportToSiren`. **Must implement `IRExporter` from `@sirenpm/core`** (Phase 2.3 plan item 24): wrap the existing function as a class with `export(ctx: IRContext): string`, or export a compatible adapter. Keep the standalone function export if other callers rely on it.
- `comment-exporter.ts` — `exportWithComments`. Currently imports `CommentToken`, `Origin` from `../parser/cst` and `SourceIndex` from `../parser/source-index`; in the new package those imports are local (`../parser/*`), with `Origin` sourced from `@sirenpm/core`.
- `formatters.ts` — shared formatting utilities. Moves as-is.
- `index.ts` — barrel re-exporting `exportWithComments`, `exportToSiren`, and everything from `formatters`.

Colocated test:
- `comment-exporter.test.ts`

### `IRContext.fromCst()` bridge removal (Phase 1.3 step 9)

`IRContext.fromCst(cst, source?)` has been deleted from `packages/core/src/ir/context.ts`. Along with it:

- `IRContext.fromResources(resources, source?, parseDiagnostics?)` lost its `parseDiagnostics` parameter — it now takes `(resources, source?)` only.
- The `IRContext` constructor's second argument (`parseDiagnostics`) is gone.
- The `parseDiagnostics` field/getter on `IRContext` is gone.

Phase 2.3 step 25 replaces the removed bridge with a free function in the language package:

```ts
// packages/language/src/context-factory.ts
import { IRContext } from '@sirenpm/core';
import type { ParseDiagnostic } from './decoder';
import { decodeDocument } from './decoder';
import type { DocumentNode } from './parser/cst';

export function createIRContextFromCst(
  cst: DocumentNode,
  source?: string,
): { context: IRContext; parseDiagnostics: readonly ParseDiagnostic[] } {
  const { document, diagnostics } = decodeDocument(cst, source);
  const resources = document?.resources ?? [];
  return {
    context: IRContext.fromResources(resources, source),
    parseDiagnostics: diagnostics,
  };
}
```

Parse diagnostics now ride as a sibling to `IRContext`, not as a field on it. Consumers (Phase 3.2 for the CLI) must combine `parseDiagnostics` with `ir.diagnostics` at the call site.

### Tests, helpers, and fixtures (Phase 1.4)

Relocated from `packages/core/test/` to `staging/language-tests/test/`, preserving paths relative to `packages/core/`. Phase 2.4 restores into `packages/language/test/`.

**Helpers:**
- `test/helpers/node-adapter.ts` (~520 lines) — full `NodeParserAdapter` test implementation, CST conversion, comment extraction. Depends on `web-tree-sitter` and the parser sources staged above.
- `test/helpers/parser.ts` (~70 lines) — `getTestAdapter()`/`doc()` wrappers around the node adapter; caches a singleton `ParserAdapter` for integration tests.

**Integration tests (top-level):**
- `test/integration/node-adapter.test.ts` — adapter smoke tests against real `web-tree-sitter` parses.
- `test/integration/fixtures.test.ts` — snapshot-style parse over `fixtures/snippets/`.
- `test/integration/decode-fixtures.test.ts` — CST→IR decode loop over `fixtures/snippets/` plus xfail metadata.

**Project integration tests** (all under `test/integration/projects/`, every one consumes `helper.ts` which calls `IRContext.fromCst`):
- `helper.ts` — `parseAndDecodeAll()` walks a fixture dir, parses every `.siren`, calls `IRContext.fromCst`.
- `array-depends.test.ts`, `circular-depends.test.ts`, `complete-flag.test.ts`, `complete-short-circuit.test.ts`, `dangling-dependencies.test.ts`, `deep-dependencies.test.ts`, `deep-nested.test.ts`, `duplicate-ids.test.ts`, `empty-files.test.ts`, `incomplete-leaf-rendering.test.ts`, `init-with-broken.test.ts`, `list-milestones.test.ts`, `list-single-milestone.test.ts`, `list-tasks-alpha-only.test.ts`, `list-with-broken-and-valid.test.ts`, `list-with-broken.test.ts`, `loaded-project.test.ts`, `milestone-dependency.test.ts`, `milestone-implicit-complete.test.ts`, `multiple-files.test.ts`, `multiple-parse-errors.test.ts`, `no-milestones-only-tasks.test.ts`, `overlapping-cycles.test.ts`, `parse-errors.test.ts`, `quoted-identifiers.test.ts`, `recursive.test.ts`, `tasks-by-milestone.test.ts`, `unicode.test.ts`.

**Root-level core tests:**
- `test/factory.test.ts` — exercises `createParserFactory` + `IRContext.fromCst`; imports deleted `src/parser/factory`. Staged as-is.

**Snippet fixtures** (all moved, consumed only by `fixtures.test.ts` / `decode-fixtures.test.ts`):
- `test/fixtures/snippets/01-minimal.siren`
- `test/fixtures/snippets/02-simple.siren`
- `test/fixtures/snippets/03-dependencies.siren`
- `test/fixtures/snippets/04-complete.siren`
- `test/fixtures/snippets/comments-complex.siren`
- `test/fixtures/snippets/comments-detached.siren`
- `test/fixtures/snippets/comments-leading.siren`
- `test/fixtures/snippets/comments-trailing.siren`

**Project fixtures — DEFERRED, not staged.** All 34 directories under `packages/core/test/fixtures/projects/` remain in place because `apps/cli/test/helpers/fixture-utils.ts` and `apps/cli/test/golden.test.ts` reference them via hardcoded relative path (`../../../packages/core/test/fixtures/projects`). Moving them would require touching CLI, which is explicitly out of scope for Release 1. Phase 2.4 must either copy or symlink them into `packages/language/test/fixtures/projects/`; Phase 3.3 can then repoint CLI fixture-utils once the CLI migration lands.

**Already-deleted colocated unit tests (reference only, for Phase 2.4 recreation):**
- `packages/core/src/exporter.test.ts` — deleted in Phase 1.3 alongside `siren-exporter.ts`. Covered round-trip export of the existing project fixtures (printed output matched golden text). Recreate in `packages/language/src/export/` (or colocated) when the exporter sources are restored.
- `packages/core/src/parser/adapter.test.ts`, `packages/core/src/parser/cst.test.ts`, `packages/core/src/parser/source-index.test.ts` — deleted with their src counterparts in Phase 1.3. Listed alongside their src files above under "Parser sources".
- `packages/core/src/decoder/index.test.ts` — deleted with the decoder source. Listed under "Decoder sources".
- `packages/core/src/export/comment-exporter.test.ts` — deleted with the export directory. Listed under "Export sources".

**Residual `IRContext.fromCst` usage rewritten in place (not staged):**
- `packages/core/src/ir/context.test.ts` — one describe block (`fromCst with origin.document`) ported to construct `Resource[]` directly and call `IRContext.fromResources(resources, source)`.

## Release 3 port targets

_Populated during Release 1 Phase 1.3._

### CLI code updates (Phase 3.2)

- **`apps/cli/src/adapter/node-parser-adapter.ts` and `apps/cli/src/adapter/node-parser-adapter.test.ts`** — delete entirely. The CLI calls `createParser()` from `@sirenpm/language` (zero-config, owns `web-tree-sitter` init internally).
- **`apps/cli/src/parser.ts`** — switch parser imports (`ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, CST types, `createParser`) to `@sirenpm/language`; keep IR imports from `@sirenpm/core`.
- **`apps/cli/src/project.ts`** — replace `IRContext.fromCst(...)` with `createIRContextFromCst(...)` imported from `@sirenpm/language`; combine the returned `parseDiagnostics` with `ir.diagnostics` at the output boundary (no longer available on `ir`).
- **`apps/cli/src/commands/format.ts`** — same `fromCst` → `createIRContextFromCst` swap; import `exportWithComments` / `exportToSiren` from `@sirenpm/language`.
- **`apps/cli/src/format-diagnostics.ts`** — update code literals: language-phase warnings become `WL001`, `WL002`, `WL003`; language-phase error becomes `EL001`; core semantic codes become `W001`, `W002`, `W003` (already renumbered in Phase 1.1). **Preserve the `WL003` (duplicate-id) special case** that reads `secondLine`/`secondColumn` when formatting the position prefix.
- **`apps/cli/src/format-parse-error.ts`** — re-source the `ParseError` import from `@sirenpm/language`.

### CLI package metadata (Phase 3.1)

- **`apps/cli/package.json`**:
  - bump `"@sirenpm/core"` to `"^0.2.0"`.
  - add `"@sirenpm/language": "^0.1.0"` (npm pin, not `workspace:*`).
  - remove `"web-tree-sitter"` — now transitive via `@sirenpm/language`.

### CLI golden files (Phase 3.3)

- **`apps/cli/test/expected/*.txt`** — regenerate every golden that prints a diagnostic code. Rewrite language-phase codes (`W001`→`WL001`, `W002`→`WL002`, `W003`→`WL003`, `E001`→`EL001`) and confirm core semantic codes read `W001`/`W002`/`W003`. Typical affected fixtures include (non-exhaustive, verify with `grep -rl "W00[1-6]\|E001" apps/cli/test/expected/`):
  - `circular-dependency-in-chain.out.txt`
  - `dangling-dependencies.out.txt`
  - `duplicate-ids.out.txt`
  - any other `*.out.txt` whose parent fixture exercises parse diagnostics.
