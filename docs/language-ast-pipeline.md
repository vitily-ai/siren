# Language AST Pipeline

> **Update: Core v0.6.0 Adoption**
>
> After the rebuild landed, `@sirenpm/core` published v0.6.0 with two breaking changes that
> the language package must adopt:
>
> - **ADR-0005 (entries over documents):** Flat `SirenEntry[]` replaces `SirenDocument`/`Resource`.
>   `ParsedDocument.toSirenDocument()` becomes `toEntries()`. `SirenBuilder.fromDocuments()`
>   becomes `fromEntries()`.
> - **ADR-0006 (origin demotion):** `Origin` removed from core. Language owns it natively.
>   `DiagnosticBase` becomes generic `DiagnosticBase<'E','L'>` / `DiagnosticBase<'W','L'>`.
>
> The sections below reflect the original ADR-0004 plan. A **Phase 7** section at the end
> tracks the v0.6.0 adoption work. The siren backlog (`siren/language-ast-pipeline.siren`)
> has `lang-v060-*` tasks for the implementation. Decisions table entries marked with
> **(v0.6.0)** reflect the updated target.

## Overview

Rebuild `@sirenpm/language` from scratch using the Siren AST as the public parse boundary. The grammar and committed WASM artifact remain the implementation jump-off point; all source code in `packages/language/src/` has been deleted and is to be replaced by the architecture described in `docs/adr/0004-siren-ast-language-boundary.md`.

The core change is that the public parsed source representation graduates from the older `ParseResult.syntaxDocuments` shape to a lean, span-free `SirenAst` exposed through a `ParsedDocument` wrapper. The Tree-sitter CST stays private inside the package and backs formatting, comment preservation, origin metadata, and diagnostics.

This plan also tracks the adoption of the rebuilt package in `@sirenpm/cli` and the eventual publication of both packages.

---

## Background and Motivation

### Why the old source was removed

The old `packages/language/src/` was written against a `ParseResult.syntaxDocuments` boundary that conflated formatting trivia, raw spelling, CST topology, and decode concerns into a single public shape. This made the package difficult to reason about, kept raw tree-sitter concerns leaking into consumer code, and required a complex offset-arithmetic plumbing layer inherited from multi-document concatenated parsing.

ADR `0001-parsed-document-model-language-boundary.md` described the original intent; it is now superseded by `0004-siren-ast-language-boundary.md`, which captures all binding decisions for the rebuilt implementation.

### The tuple-first core assumption

The decode service (`ParsedDocument.toSirenDocument()`) targets a modified `@sirenpm/core` contract in which `Attribute.value` is a tuple-first bare readonly array of atoms rather than the current scalar/array discriminated union. This contract change is tracked separately in `siren/tuple-first-core.siren`. Implementation of `lang-decode` must either wait for that change or use an explicit compatibility shim; silently targeting the current scalar model would contradict ADR 0004.

---

## Decisions

All decisions below are binding. Full rationale is in ADR 0004.

| # | Decision | Binding choice |
|---|---|---|---|
| 1 | Public boundary term | Siren AST (public type); `ParsedDocument` (public wrapper); CST private |
| 2 | AST nature | Span-free, trivia-free, non-semantic. No raw text, comments, spans, dependency resolution, or semantic diagnostics on AST nodes |
| 3 | CST privacy | Raw Tree-sitter nodes are not public API |
| 4 | Parser surface | `parser.parse({ name, content })` → `ParsedDocument`; `parser.parseBatch(docs[])` → `ParsedDocument[]` |
| 5 **(v0.6.0)** | ParsedDocument services | `.ast`, `.diagnostics`, **`.toEntries(options?)`** (replaces `.toSirenDocument()`), `.format()` |
| 6 **(v0.6.0)** | No language project builder | No `ParsedDocument → SirenProject` helper. Callers use **`SirenBuilder.fromEntries(docs.flatMap(d => d.toEntries()))`** |
| 7 | Tuple model | Tuples are normalized readonly member arrays; implicit vs. explicit bracket syntax is not distinguished |
| 8 | Tuple-first core | Every AST tuple decodes to a tuple-first bare readonly atom array (implemented in core v0.5.0). |
| 9 **(v0.6.0)** | Identifier values | Bare identifiers → `{ kind: 'reference', id }` via `Atom`/`EntryReference`. Quoted strings → string normally, BUT inside `depends_on` → `{ kind: 'reference', id }` |
| 10 | Status modifiers | Last recognized wins. Unrecognized → `WL001`. Multiple recognized collapsed → `WL002`. Recognized set: `complete`, `draft` |
| 11 | Formatter | Canonical, CST-backed. Refuses on parse errors. Comments emitted in lexical order as standalone lines. No blank-line or trailing-comment preservation |
| 12 | Error recovery | Resources with parse errors are omitted from the AST; valid siblings remain; `EL001` emitted per excluded resource |
| 13 **(v0.6.0)** | Directive + synthesis | `toEntries()` omits directive. Default-off `synthesizeMilestones` option appends one synthetic milestone per source document (per ADR-0005). Core absent-directive default = synthesis enabled. |
| 14 | AST identifiers | Normalized strings only. Source spelling (quoted vs. bare) is CST-internal |
| 15 **(v0.6.0)** | Origins | Private CST backreferences populate **language-native** `Origin` on `SourcedEntry`/`SourcedAttribute`; AST stays span-free. Core v0.6.0 removed `Origin` — it is defined at `packages/language/src/origin.ts`. |
| 16 | Formatting | Walks private CST, not the public AST |

---

## Out of Scope

- ~~**Tuple-first core migration** (`@sirenpm/core` `AttributeValue` change): tracked separately.~~ (Resolved — core v0.5.0 published with tuple-first contract.)
- ~~**Origin removal from core** (`Origin`, `RangeOrigin`, `SyntheticOrigin`):~~ (Resolved — core v0.6.0 published with Origin removed. Language adoption tracked in Phase 7.)
- **Directive syntax in grammar**: future grammar work; AST nodes for directives will be added when grammar adds them.
- **Blank-line and trailing-comment preservation**: deferred past initial formatter implementation.
- **Semantic diagnostics** (`W001`–`W003`): remain in `@sirenpm/core`; language emits only `EL001`, `WL001`, `WL002`.
- **`WL003`** or other legacy codes: do not carry forward; see `debt.siren`.

---

## Implementation Tasks

### `lang-docs` — Documentation (complete)

Update `CONTEXT.md` glossary to replace the old Parsed Document Model terms with Siren AST / ParsedDocument. Create `docs/adr/0004-siren-ast-language-boundary.md` superseding ADR 0001. Create `packages/language/README.md` documenting the public API shape, diagnostics table, and formatting policy.

Outcome: no source changes yet, but the architecture is fully documented and reviewable before a line of implementation is written.

---

### `lang-parser` — Parser factory and ParsedDocument scaffold

**Relevant files:** `packages/language/src/index.ts`, `packages/language/src/parser/factory.ts`, `packages/language/src/parser/types.ts`

Implement `createParser()` with zero-config WASM loading via `new URL(...)` package-relative resolution (no consumer-supplied paths). Define the `SourceDocument` input shape (`{ name: string, content: string }`), the `ParsedDocument` public wrapper class/interface, and the parser object returned by `createParser()`.

`parse(document: SourceDocument): Promise<ParsedDocument>` parses a single document independently. `parseBatch(documents: readonly SourceDocument[]): Promise<ParsedDocument[]>` is a convenience wrapper that calls `parse` once per document.

At this stage `ParsedDocument` may return stub/empty values from `.ast`, `.diagnostics`, `.toSirenDocument()`, and `.format()`. The goal of this task is to establish the public API contract and WASM loading before inner services are implemented.

Depends on: `lang-docs`

---

### `lang-ast-builder` — Siren AST from CST

**Relevant files:** `packages/language/src/ast/types.ts`, `packages/language/src/ast/builder.ts`

Define the Siren AST types: `SirenAst`, `AstResource`, `AstAttribute`, `AstTuple`, `AstTupleMember`, `AstStatusModifier`. All identifiers are normalized strings. The AST carries no spans, no raw text, no trivia, no comments.

Implement the CST→AST builder that walks the private tree-sitter CST. Resources whose subtree contains a parse error are excluded from the AST; `EL001` is emitted for each excluded resource. Valid sibling resources remain.

Status modifier handling: collect all recognized modifiers in order; last recognized wins for the resolved `status` field. Emit `WL001` for each unrecognized modifier; emit `WL002` when multiple recognized modifiers are collapsed. Recognized set: `complete`, `draft`.

Wire the builder into `ParsedDocument.ast`.

Depends on: `lang-parser`, `lang-diagnostics`

---

### `lang-diagnostics` — Structured language diagnostic types

**Relevant files:** `packages/language/src/diagnostics/types.ts`

Define the language diagnostic taxonomy with no embedded display message. Each diagnostic is structured data; frontends assemble human-readable text from code, severity, and contextual fields.

Initial taxonomy:

| Code | Severity | Contextual fields |
|---|---|---|
| `EL001` | error | `resourceId?`, `documentName`, `nodeType` |
| `WL001` | warning | `resourceId`, `modifier`, `documentName` |
| `WL002` | warning | `resourceId`, `recognizedModifiers`, `resolvedStatus`, `documentName` |

Export a union type `LanguageDiagnostic` and discriminated subtypes per code. The `DiagnosticBase` from `@sirenpm/core` provides the `code` and `severity`. No embedded `message` field. The `origin` field is **language-native** (defined at `packages/language/src/origin.ts`, not from core). Because core v0.6.0 makes `DiagnosticBase` generic over severity and package char, the concrete extends are `EL001Diagnostic extends DiagnosticBase<'E','L'>`, `WL001`/`WL002` extend `DiagnosticBase<'W','L'>`.

Depends on: `lang-parser`

---

### `lang-decode` — ParsedDocument.toSirenDocument() (→ toEntries() in v0.6.0)

**Relevant files:** `packages/language/src/decoder/index.ts`

Implement `ParsedDocument.toSirenDocument()` (pre-v0.6.0 name) / `toEntries()` (v0.6.0+) following all decode rules from ADR 0004:

- Every AST tuple decodes to the tuple-first core value shape (bare readonly atom array).
- Bare identifier tuple members → `{ kind: 'reference', id }` (`EntryReference`).
- Quoted string tuple members → string, except inside `depends_on` → `{ kind: 'reference', id }`.
- Resolved status from last-recognized modifier → `entry.status`.
- No document-level wrapper: output is a flat `readonly SirenEntry[]` (or `SourcedEntry[]` when origins are present), not a `SirenDocument` with `resources`.
- Document directive is omitted; the `synthesizeMilestones` option (default-off) appends one synthetic milestone per source document.
- Private CST backreferences may populate language-native `Origin` metadata via `SourcedEntry`/`SourcedAttribute` while the AST stays span-free.

**v0.6.0 adoption:** The method is renamed from `toSirenDocument(): SirenDocument` to `toEntries(options?: { synthesizeMilestones?: boolean }): readonly SourcedEntry[]`. The decoder drops `import { Resource, SirenDocument }` and uses `SirenEntry`/`Attribute`/`Tuple`/`Atom` from `@sirenpm/core` and `Origin` from the language-native `../origin`.

Depends on: `lang-ast-builder`, `lang-diagnostics`, `tuple-first-core`

---

### `lang-format` — ParsedDocument.format()

**Relevant files:** `packages/language/src/format/formatter.ts`

Implement `ParsedDocument.format()` as a canonical, deterministic CST-backed formatter.

Rules:
- Refuse (throw or return error) if the document has parse errors.
- Walk the private CST to emit canonical Siren text.
- Emit all comment tokens in lexical source order as standalone lines with canonical indentation.
- Do not preserve blank-line counts or trailing-comment placement.
- Do not implement a trivia classification system in this phase.

The formatter operates on the private CST, not the public AST. No public CST types are introduced.

Depends on: `lang-ast-builder`

---

### `lang-cli` — CLI consumer adoption

**Relevant files:** `apps/cli/src/lifecycle/parsing.ts`, `apps/cli/src/lifecycle/decoding.ts`, `apps/cli/src/lifecycle/diagnostics.ts`, `apps/cli/src/commands/format.ts`

Update the CLI lifecycle to consume the rebuilt `@sirenpm/language` API:

1. Replace any remaining `parser.parse(docs[])` batch calls with per-document loops over `parser.parse(doc)` or `parser.parseBatch(docs)`.
2. Replace `syntaxDocuments` / `decodeSyntaxDocuments` usage with `ParsedDocument.toEntries()` per document, then `SirenBuilder.fromEntries(...)`.
3. Replace old formatter calls with `parsedDoc.format()`.
4. Thread language diagnostics into the CLI diagnostic display alongside core semantic diagnostics.

The CLI must not call tree-sitter APIs directly; all source-language access goes through `@sirenpm/language`.

**v0.6.0 adoption note:** The CLI also needs `eod-cli-bridge` (`SirenBuilder.fromDocuments` → `fromEntries`, `sirenDocuments` → `sirenEntries`) and `origin-demotion-cli` (diagnostic position resolution via entry references instead of `DiagnosticBase.file`/`line`/`column`). These are tracked in `siren/entries-over-documents.siren` and `siren/origin-demotion.siren`.

Depends on: `lang-decode`, `lang-format`

---

### `lang-tests` — Focused test coverage

Add tests at each layer that owns behavior:

- **Parser tests**: `createParser()` resolves WASM; `parse()` returns `ParsedDocument`; `parseBatch()` returns one result per document.
- **AST tests**: normalized resource types and IDs; status modifier resolution (last-recognized wins, WL001, WL002); tuple member decoding; parse-error resource omission (EL001).
- **Decode tests**: tuple-first values; bare vs. quoted identifiers; `depends_on` quoted references; directive omission; `origin` population.
- **Formatter tests**: canonical output; parse-error refusal; comment preservation in lexical order.
- **CLI golden tests**: update only if CLI behavior changes.

Use `projects` fixtures under `packages/language/test/fixtures/projects/` for decode coverage. Use `snippets` fixtures under `packages/language/test/fixtures/snippets/` for grammar/AST cases. Use `apps/cli/test/expected/` golden files for CLI assertions.

Depends on: `lang-decode`, `lang-format`

---

### `lang-publish` — Publish updated packages

Publish updated `@sirenpm/language` (with new public API) and `@sirenpm/cli` (with updated consumer). Both must compile cleanly against the published `@sirenpm/core` v0.6.0 that removes `Origin`, `SirenDocument`, and `Resource`. Update CLI and language package versions appropriately. Ensure WASM artifact is included in the language npm bundle.

Depends on: `lang-cli`, `lang-tests`

---

## Phase 7 — Adopt `@sirenpm/core` v0.6.0 Breaking Changes

After the ADR-0004 rebuild landed, `@sirenpm/core` published v0.6.0 with two breaking changes
that the language package must adopt. This phase is tracked by the `lang-v060-*` tasks in
`siren/language-ast-pipeline.siren`.

### What changed in core

| Change | ADR | Core version |
|---|---|---|
| Flat `SirenEntry[]` replaces `SirenDocument`/`Resource`. `SirenBuilder.fromEntries()` only. | 0005 | v0.6.0 |
| `Origin`, `RangeOrigin`, `SyntheticOrigin` removed from core. Language owns them natively. | 0006 | v0.6.0 |
| `DiagnosticBase` now generic: `DiagnosticBase<'E','L'>` / `DiagnosticBase<'W','L'>`. No `file`/`line`/`column`. | 0006 | v0.6.0 |
| `SourcedEntry extends SirenEntry { origin: Origin }` — structural extension preserved by klona/deep-freeze. | 0006 | — (language-side) |
| Tuple-first `Attribute.value` (bare `readonly Atom[]`). | (prerequisite) | v0.5.0 |

### Tasks

See `siren/language-ast-pipeline.siren` for the full dependency-ordered task list. Summary:

| Task | What it does |
|---|---|
| `lang-v060-origin` | Create `packages/language/src/origin.ts` owning `RangeOrigin` (moved from `ast/origins.ts`), `SyntheticOrigin`, and the `Origin` union. Define `SourcedEntry`/`SourcedAttribute`. |
| `lang-v060-decode-entries` | Rename `decodeAstToSirenDocument` → `decodeAstToEntries` returning `readonly SirenEntry[]`. Rename `toSirenDocument()` → `toEntries(options?)`. Drop `Resource`/`SirenDocument` imports. |
| `lang-v060-synthesis` | Add default-off `synthesizeMilestones` option to `toEntries()`. Append one synthetic milestone per source document (id = name sans `.siren`, `SyntheticOrigin`). |
| `lang-v060-diagnostics` | Swap `extends DiagnosticBase` → `extends DiagnosticBase<'E','L'>` / `<'W','L'>`. Replace core `Origin` import with `../origin`. |
| `lang-v060-exports` | Export `Origin` types and `Sourced*` extensions. Bump core dep to `^0.6.0`, language version to `0.5.0`. |
| `lang-v060-tests` | Update all tests for entry-shaped decode, language-native origin, generic `DiagnosticBase`, and synthesis. |

### Superseded backlog

The following tasks in other backlog files targeted the pre-rebuild language surfaces and are
marked `complete` as superseded:

| File | Superseded tasks | Replaced by |
|---|---|---|
| `siren/entries-over-documents.siren` | `eod-lang-red`, `eod-lang-decoder`, `eod-lang-renderer`, `eod-lang-publish` | `lang-v060-decode-entries`, `lang-v060-synthesis`, `lang-v060-exports` |
| `siren/origin-demotion.siren` | `origin-demotion-language-red`, `origin-demotion-language-green`, `origin-demotion-language-publish` | `lang-v060-origin`, `lang-v060-diagnostics`, `lang-v060-exports` |

---

## Cross-File Dependency

`lang-decode` depends on the `tuple-first-core` milestone in `siren/tuple-first-core.siren`. That file is a stub; its internal tasks are TBD. Until `tuple-first-core` ships, `lang-decode` cannot be implemented against the real contract. `lang-cli` and `lang-publish` both depend on `lang-decode` and are therefore also gated.

The work in `lang-parser`, `lang-ast-builder`, `lang-diagnostics`, and `lang-format` is independent of the core tuple migration and can proceed immediately.

---

## Verification

- `yarn workspace @sirenpm/language typecheck` — no errors.
- `yarn workspace @sirenpm/language test` — all tests pass.
- `yarn workspace @sirenpm/cli test` — golden files match.
- `yarn workspaces foreach -pv run test` — full suite green.
- `parser.parse({ name: 'x.siren', content })` returns `ParsedDocument` without configuring WASM paths.
- `parsedDoc.toSirenDocument()` followed by `SirenBuilder.fromDocuments([...])` builds a valid `SirenProject`.
- `parsedDoc.format()` on a valid document is idempotent.
- `parsedDoc.format()` on a document with parse errors throws or returns a diagnostic.
