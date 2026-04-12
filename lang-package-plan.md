## Plan: Extract `@siren/language` from `@siren/core`

Split parser/grammar/decoding/**and all export logic** from `packages/core` into a new `packages/language` package (`@siren/language`). Core retains IR types, semantic validation, utilities, a `DiagnosticsBag` for unified diagnostic collection, and an `IRExporter` interface — zero knowledge of grammar, CST, or Siren syntax. Language owns grammar, CST types, parser factory, decoder (CST→IR), comment classification, ALL exporters (both `exportToSiren` and `exportWithComments`), and formatters. Dependency: `@siren/language → @siren/core` (one-way).

Two additional design changes from v1:
1. **All export logic moves to language** — Core defines a document-level `IRExporter` interface; language implements it for Siren syntax. Core has no formatting knowledge.
2. **Unified diagnostics via DiagnosticsBag** — Core defines a common `DiagnosticBase` interface and a `DiagnosticsBag` collection. Core semantic diagnostics (W004–W006) get a `message` field. Language parse diagnostics adopt prefixed codes (WL001–WL003, EL001). Consumers read one unified stream.

**Architecture after split:**
```
@siren/language (packages/language/)
  ├── grammar/         ← tree-sitter grammar definition + WASM
  ├── src/
  │   ├── parser/      ← adapter interface, factory, CST types, source-index
  │   ├── decoder/     ← CST→IR transformation, language-phase diagnostics (WL/EL codes)
  │   └── export/      ← ALL exporters (exportToSiren, exportWithComments) + formatters
  depends on: @siren/core (IR types, IRExporter interface, DiagnosticsBag)

@siren/core (packages/core/)
  ├── src/
  │   ├── ir/          ← types, IRContext, semantic diagnostics (W004-W006), Origin,
  │   │                  DiagnosticsBag, IRExporter interface
  │   └── utilities/   ← graph, dependency-tree, milestone, entry
  depends on: nothing
```

**Consumer dependency graph:**
- `@siren/cli` → `@siren/language` + `@siren/core`
- `@siren/web` → `@siren/core` (minimal; add `@siren/language` when parsing is needed)

---

### Phase 1: Unified Diagnostics Foundation

1. **Define `DiagnosticBase` and `DiagnosticsBag` in core** — Create `packages/core/src/ir/diagnostics.ts`. `DiagnosticBase` interface: `{ code: string, severity: 'error'|'warning'|'info', message: string, file?: string, line?: number, column?: number }` — the common shape ALL diagnostics (core and extension) must satisfy. Extra structured fields (resourceId, nodes, etc.) are allowed beyond the base. `DiagnosticsBag` class: `add()` / `addAll()`, `get all` (sorted by file, then line), `get warnings`, `get errors`. Append-only, getters always reflect current state.
2. **Add `message` to semantic diagnostics** — Modify `DanglingDependencyDiagnostic`, `CircularDependencyDiagnostic`, `DuplicateIdDiagnostic` in `packages/core/src/ir/context.ts` to extend `DiagnosticBase` and include a computed `message` at creation time. Messages match what CLI currently assembles ad-hoc (e.g., `"Circular dependency detected: a -> b -> c -> a"`). Update `computeDiagnostics()` and friends to populate `message`.
3. **Integrate `DiagnosticsBag` into `IRContext`** — Constructor accepts optional bag (or creates one internally). `fromResources()` gains optional `bag` parameter. Semantic diagnostics auto-added to bag when computed. New `get bag()` getter. Existing `diagnostics` and `parseDiagnostics` getters remain for backward compat during migration.
4. **Verify** — `yarn workspace @siren/core tsc --noEmit` + `yarn workspace @siren/core test`.

### Phase 2: IRExporter Interface and Prepare Core for Decoupling

5. **Define `IRExporter` interface in core** — Create `packages/core/src/ir/exporter.ts`: `interface IRExporter { export(ctx: IRContext): string }`. This is the contract that language packages implement. Core never calls it directly — consumers (CLI, web) call the exporter they choose. Export from `packages/core/src/index.ts`.
6. **Relocate `Origin` to IR** — Move `Origin` interface from `packages/core/src/parser/cst.ts` into `packages/core/src/ir/types.ts`. Leave a temporary re-export in `cst.ts` for back-compat.
7. **Promote `ParseDiagnostic` to core** — Move `ParseDiagnostic` (and `ParseWarning`, `ParseError` sub-interfaces) from `packages/core/src/decoder/index.ts` into `packages/core/src/ir/diagnostics.ts`. Ensure they extend `DiagnosticBase`.
8. **Remove `IRContext.fromCst()`** — Delete the static method from `packages/core/src/ir/context.ts` along with `decodeDocument` and `DocumentNode` imports. `IRContext.fromResources()` becomes the sole factory. Temporarily breaks CLI callers (fixed in Phase 4).
9. **Verify core compiles standalone** — Zero imports from `parser/` or `decoder/`. Core tests that use `fromCst()` temporarily break — they move to language in Phase 5.

### Phase 3: Create `@siren/language` Package

10. **Scaffold package** — Create `packages/language/` with `package.json` (name `@siren/language`, dep on `@siren/core: workspace:*`), `tsconfig.json`, `vitest.config.ts` (node env). Register in root `package.json` workspaces array. `yarn install`. *Parallel with step 11.*
11. **Move grammar** — `packages/core/grammar/` → `packages/language/grammar/`. Update grammar-related scripts in language `package.json`. *Parallel with step 10.*
12. **Move parser source** — `packages/core/src/parser/` → `packages/language/src/parser/` (adapter.ts, factory.ts, cst.ts, source-index.ts, index.ts). Update `cst.ts`: import `Origin` from `@siren/core` (instead of `../ir/types.js`). Remove temporary re-export. *Depends on 10.*
13. **Move decoder** — `packages/core/src/decoder/` → `packages/language/src/decoder/` (index.ts, xfail.ts). Update imports: CST types from local `../parser/`, IR types + `ParseDiagnostic` from `@siren/core`. **Rename diagnostic codes**: W001→WL001, W002→WL002, W003→WL003, E001→EL001 — establishes the convention that language-phase diagnostics carry the `L` discriminator. *Depends on 12.*
14. **Move ALL export logic** — Move the entire `packages/core/src/export/` directory → `packages/language/src/export/`. `siren-exporter.ts` implements `IRExporter` interface from core. `comment-exporter.ts` also implements `IRExporter` (or returns string directly). `formatters.ts` moves as-is (Siren-specific formatting). Update imports: `IRContext`, `AttributeValue`, `isArray`, `isReference` from `@siren/core`; `SourceIndex` from local `../parser/source-index.js`; `IRExporter` from `@siren/core`. *Depends on 12.*
15. **Create `createIRContextFromCst()` bridge** — New `packages/language/src/context-factory.ts`. Calls `decodeDocument()` then `IRContext.fromResources()`. Accepts optional `DiagnosticsBag` and adds language diagnostics to it. Returns `IRContext`. Replaces the removed `IRContext.fromCst()`. *Depends on 13.*
16. **Create public API** — `packages/language/src/index.ts` exports: parser types (`createParserFactory`, `ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, `CommentToken`), CST types (`DocumentNode`, `ResourceNode`, etc.), decoder (`decodeDocument`, `DecodeResult`), comments (`SourceIndex`, `ClassifiedComment`), exporters (`exportToSiren`, `exportWithComments`, `SirenExporter` class implementing `IRExporter`), formatters (`formatAttributeValue`, `formatAttributeLine`, `wrapResourceBlock`), bridge (`createIRContextFromCst`). *Depends on 14, 15.*

### Phase 4: Update Consumers

17. **Trim core exports** — Remove from `packages/core/src/index.ts`: all parser re-exports (`createParserFactory`, `ParserAdapter`, CST types, `SourceIndex`, etc.), all decoder re-exports, all export/formatter re-exports (`exportToSiren`, `exportWithComments`, formatters). Keep exporting: IR types (`Document`, `Resource`, `Attribute`, `AttributeValue`, `Origin`, `ResourceReference`, `ArrayValue`, `PrimitiveValue`), `IRContext`, `IRExporter` interface, `DiagnosticBase`, `DiagnosticsBag`, semantic diagnostics (`Diagnostic`, `CircularDependencyDiagnostic`, `DanglingDependencyDiagnostic`, `DuplicateIdDiagnostic`), `ParseDiagnostic` (now in core as shared base), utilities (`DependencyTree`, `getDependencyTree`), type guards (`isReference`, `isArray`, `isPrimitive`), `version`. Delete `packages/core/src/export/`, `packages/core/src/parser/`, `packages/core/src/decoder/` directories entirely. *Depends on 16.*
18. **Update CLI imports** — Add `"@siren/language": "workspace:*"` to `apps/cli/package.json`. Rewrite imports across CLI files: `createParserFactory`, `ParseResult`, `ParserAdapter`, `SourceDocument`, `ParseError`, `SourceIndex`, `exportToSiren`, `exportWithComments` → from `@siren/language`. `IRContext`, `Resource`, `DiagnosticsBag`, `DiagnosticBase` → from `@siren/core`. Replace `IRContext.fromCst()` → `createIRContextFromCst()` from `@siren/language`. WASM path in `apps/cli/src/adapter/node-parser-adapter.ts`: resolve relative to `packages/language/grammar/tree-sitter-siren.wasm`. *Depends on 17.*
19. **Simplify CLI diagnostics** — `apps/cli/src/format-diagnostics.ts`: take `DiagnosticBase` as input type, use `diagnostic.message` directly instead of the per-code `formatMessage()` switch. Keep per-code position formatting for W006 (uses `secondLine`/`secondColumn`). `apps/cli/src/project.ts`: replace the two-loop pattern (`parseDiagnostics` + `diagnostics`) with single `bag.all` iteration or use `bag.warnings` / `bag.errors` for pre-filtered access. *Depends on 18.*

### Phase 5: Move Tests & Fixtures

20. **Move parser/decoder/export tests to language** — `packages/core/src/parser/*.test.ts` → `packages/language/src/parser/`. `packages/core/src/decoder/*.test.ts` → `packages/language/src/decoder/`. `packages/core/src/export/comment-exporter.test.ts` → `packages/language/src/export/`. `packages/core/src/exporter.test.ts` → `packages/language/test/` (tests `exportToSiren` and/or `exportWithComments`). *Parallel with step 21.*
21. **Move snippet fixtures** — `packages/core/test/fixtures/snippets/` → `packages/language/test/fixtures/snippets/` (grammar-specific inputs). Project fixtures stay in core. *Parallel with step 20.*
22. **Split integration tests and helpers** — Inspect `packages/core/test/integration/` — parse→decode→IR flow tests go to language, pure IR/utility tests stay. Inspect `packages/core/test/helpers/` — CST construction helpers move to language; IR-only helpers stay. `packages/core/test/factory.test.ts`, `packages/core/test/milestone.test.ts` — check imports, likely stay in core.
23. **Update CLI test infrastructure** — `apps/cli/src/adapter/node-parser-adapter.test.ts` — update imports. `apps/cli/test/helpers/test-utils.ts` — update `SourceDocument` import source. Golden file tests: update expected output for renamed diagnostic codes (WL001–WL003, EL001 replacing W001–W003, E001).

### Phase 6: Cleanup & Verify

24. **Delete emptied directories** — `packages/core/src/parser/`, `packages/core/src/decoder/`, `packages/core/src/export/` (all moved).
25. **Update documentation** — Root README.md monorepo structure. `.github/copilot-instructions.md` architecture section — add `@siren/language`, update module descriptions. `AGENTS.md` repo layout. `packages/core/STATUS.md` if it references parser/exporter. Testing guidelines: language changes → snippets fixtures in language; export changes → language tests.
26. **Verify isolation** — `grep -r "parser/\|decoder/\|export/" packages/core/src/` → nothing. `grep -r "@siren/language" packages/core/src/` → nothing. `grep -r "from '.*@siren/core" packages/language/src/` → all language-to-core imports are type/value imports only.
27. **Full test suite** — see Verification section below.

---

**Relevant files**

### Core (to modify)
- `packages/core/src/ir/types.ts` — receive `Origin`; update with `DiagnosticBase`
- `packages/core/src/ir/context.ts` — remove `fromCst()`, add `message` to semantic diagnostics, integrate `DiagnosticsBag`
- `packages/core/src/ir/diagnostics.ts` — NEW: `DiagnosticBase`, `DiagnosticsBag`, `ParseDiagnostic`
- `packages/core/src/ir/exporter.ts` — NEW: `IRExporter` interface
- `packages/core/src/index.ts` — major trim: remove parser/decoder/export, add new diagnostic/exporter exports
- `packages/core/package.json` — no dep changes

### Language (to create)
- `packages/language/package.json` — new
- `packages/language/tsconfig.json` — new
- `packages/language/vitest.config.ts` — new
- `packages/language/src/index.ts` — new public API
- `packages/language/src/parser/*` — moved from core
- `packages/language/src/decoder/*` — moved from core (codes renamed WL/EL)
- `packages/language/src/export/*` — moved from core (entire directory)
- `packages/language/src/context-factory.ts` — new bridge function
- `packages/language/grammar/` — moved from core

### CLI (to update)
- `apps/cli/package.json` — add `@siren/language` dep
- `apps/cli/src/adapter/node-parser-adapter.ts` — imports + WASM path
- `apps/cli/src/parser.ts` — imports
- `apps/cli/src/project.ts` — imports, `fromCst` → `createIRContextFromCst`, `DiagnosticsBag` usage
- `apps/cli/src/commands/format.ts` — imports, `fromCst` replacement
- `apps/cli/src/format-diagnostics.ts` — simplify with `DiagnosticBase.message`
- `apps/cli/src/format-parse-error.ts` — `ParseError` import source
- `apps/cli/test/expected/*.txt` — update diagnostic codes W001→WL001 etc.

**Verification**
1. `grep -r "parser/\|decoder/\|export/" packages/core/src/` → returns nothing
2. `grep -r "@siren/language" packages/core/src/` → returns nothing (no reverse dep)
3. `yarn workspace @siren/core tsc --noEmit` → compiles clean
4. `yarn workspace @siren/language tsc --noEmit` → compiles clean
5. `yarn workspace @siren/core test` → IR, utility tests pass
6. `yarn workspace @siren/language test` → parser, decoder, exporter tests pass
7. `yarn workspace @siren/cli test` → golden-file tests pass (with updated diagnostic codes)
8. `yarn workspaces foreach -pv run test` → full suite green

**Decisions**
- **All export logic moves to language** — Core has zero Siren syntax knowledge. Core defines `IRExporter` interface; language implements it.
- **IRExporter is document-level** — `export(ctx: IRContext): string`. Simple; each implementation owns its walk + formatting.
- **DiagnosticsBag in core** — Central collection for diagnostics from any source. Core owns the bag; extensions add to it.
- **All diagnostics carry `message`** — Computed at creation time. Eliminates CLI-side message assembly. Extra structured fields remain for programmatic access.
- **Language diagnostic code prefix: `L`** — W001→WL001, E001→EL001. Core keeps W004–W006. Convention: each extension package uses its own letter prefix.
- **`Origin` relocates to core** — positional metadata, not grammar-specific; prevents circular dep
- **`ParseDiagnostic` relocates to core** — extends `DiagnosticBase`; language decoder emits instances with `WL`/`EL` codes
- **`IRContext.fromCst()` replaced by `createIRContextFromCst()` in language** — the sole bridge between parsing and the IR layer
- **Scope excluded**: no grammar changes, no new features, no major diagnostic renumbering of core codes

**Further Considerations**
1. **Golden file updates for diagnostic codes** — Renaming W001→WL001 etc. will change CLI output. All golden files under `apps/cli/test/expected/` referencing these codes need updating. This is mechanical but should be done in a single commit for easy review.
2. **DiagnosticsBag mutability model** — Simplest: append-only, getters always reflect current state. If snapshot semantics are needed later, add `.snapshot()` method. Start simple.
3. **Core diagnostic code renumbering** — Core keeps W004–W006. Optionally renumber to W001–W003 since W001–W003 codes are vacated. Deferring this avoids golden file churn and keeps the change focused.
4. **Parser factory test fixtures** — WASM-loading tests in language's vitest config may need special setup. Check if existing helpers handle this.
5. **Core test helpers** — `packages/core/test/helpers/` may construct CST nodes for tests. These either move to language or get rewritten to construct IR directly.
6. **CLI tsup bundle** — `apps/cli/tsup.config.ts` may hardcode core paths. Verify the bundle correctly resolves both `@siren/core` and `@siren/language` workspace imports.
