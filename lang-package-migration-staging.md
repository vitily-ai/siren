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
