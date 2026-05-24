# Language AST Pipeline

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
|---|---|---|
| 1 | Public boundary term | Siren AST (public type); `ParsedDocument` (public wrapper); CST private |
| 2 | AST nature | Span-free, trivia-free, non-semantic. No raw text, comments, spans, dependency resolution, or semantic diagnostics on AST nodes |
| 3 | CST privacy | Raw Tree-sitter nodes are not public API |
| 4 | Parser surface | `parser.parse({ name, content })` → `ParsedDocument`; `parser.parseBatch(docs[])` → `ParsedDocument[]` |
| 5 | ParsedDocument services | `.ast`, `.diagnostics`, `.toSirenDocument()`, `.format()` |
| 6 | No language project builder | No `ParsedDocument → SirenProject` helper. Callers use `SirenBuilder.fromDocuments(docs.map(d => d.toSirenDocument()))` |
| 7 | Tuple model | Tuples are normalized readonly member arrays; implicit vs. explicit bracket syntax is not distinguished |
| 8 | Tuple-first core | Every AST tuple decodes to a tuple-first bare readonly atom array. Core migration is out of scope but assumed |
| 9 | Identifier values | Bare identifiers → unresolved references everywhere. Quoted strings → strings normally, BUT inside `depends_on` → unresolved references |
| 10 | Status modifiers | Last recognized wins. Unrecognized → `WL001`. Multiple recognized collapsed → `WL002`. Recognized set: `complete`, `draft` |
| 11 | Formatter | Canonical, CST-backed. Refuses on parse errors. Comments emitted in lexical order as standalone lines. No blank-line or trailing-comment preservation |
| 12 | Error recovery | Resources with parse errors are omitted from the AST; valid siblings remain; `EL001` emitted per excluded resource |
| 13 | Directive handling | `toSirenDocument()` omits directive. Core absent-directive default = synthesis enabled |
| 14 | AST identifiers | Normalized strings only. Source spelling (quoted vs. bare) is CST-internal |
| 15 | Origins | Private CST backreferences may populate core `origin` metadata; AST stays span-free |
| 16 | Formatting | Walks private CST, not the public AST |

---

## Out of Scope

- **Tuple-first core migration** (`@sirenpm/core` `AttributeValue` change): tracked separately in `tuple-first-core.siren`.
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

Export a union type `LanguageDiagnostic` and discriminated subtypes per code. The `DiagnosticBase` from `@sirenpm/core` provides the `code`, `severity`, and optional `origin` base. No embedded `message` field.

Depends on: `lang-parser`

---

### `lang-decode` — ParsedDocument.toSirenDocument()

**Relevant files:** `packages/language/src/decoder/index.ts`

Implement `ParsedDocument.toSirenDocument()` following all decode rules from ADR 0004:

- Every AST tuple decodes to the tuple-first core value shape (bare readonly atom array).
- Bare identifier tuple members → unresolved `ResourceReference`.
- Quoted string tuple members → string, except inside `depends_on` → unresolved `ResourceReference`.
- Resolved status from last-recognized modifier → `Resource.status`.
- Document directive omitted from `SirenDocument`; core absent-directive default = synthesis enabled.
- Private CST backreferences may populate `origin` metadata while the AST stays span-free.

This task assumes the tuple-first `@sirenpm/core` contract (`Attribute.value` is a bare readonly tuple array) is in place. If that contract is not yet published, implementation must use an explicit shim with a comment referencing this assumption.

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
2. Replace `syntaxDocuments` / `decodeSyntaxDocuments` usage with `ParsedDocument.toSirenDocument()` per document, then `SirenBuilder.fromDocuments(...)`.
3. Replace old formatter calls with `parsedDoc.format()`.
4. Thread language diagnostics into the CLI diagnostic display alongside core semantic diagnostics.

The CLI must not call tree-sitter APIs directly; all source-language access goes through `@sirenpm/language`.

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

Publish updated `@sirenpm/language` (with new public API) and `@sirenpm/cli` (with updated consumer). Both must compile cleanly against the published `@sirenpm/core` version that contains the tuple-first `AttributeValue` contract. Update CLI and language package versions appropriately. Ensure WASM artifact is included in the language npm bundle.

Depends on: `lang-cli`, `lang-tests`

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
