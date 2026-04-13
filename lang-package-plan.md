## Plan: Extract `@siren/language` from `@siren/core`

Split parser/grammar/decoding and all export logic from `packages/core` into `packages/language` (`@siren/language`). Core keeps IR types, semantic validation, utilities, `DiagnosticBase`, and `IRExporter`; language owns grammar, CST types, parser factory, decoder (CST→IR), comment classification, exporters, and formatters. Dependency stays one-way: `@siren/language` → `@siren/core`.

`DiagnosticBase` is message-free, and parse diagnostics stay in language and are surfaced separately from `IRContext`.

**Architecture after split:**
```
@siren/language (packages/language/)
  ├── grammar/         ← tree-sitter grammar definition + WASM
  ├── src/
  │   ├── parser/      ← adapter interface, factory, CST types, source-index
  │   ├── decoder/     ← CST→IR transformation, language-phase diagnostics (WL/EL codes)
  │   └── export/      ← ALL exporters (exportToSiren, exportWithComments) + formatters
  depends on: @siren/core (IR types, IRExporter interface, DiagnosticBase)

@siren/core (packages/core/)
  ├── src/
  │   ├── ir/          ← types, IRContext, semantic diagnostics (W001-W003), Origin,
  │   │                  DiagnosticBase, IRExporter interface
  │   └── utilities/   ← graph, dependency-tree, milestone, entry
  depends on: nothing
```

**Consumer dependency graph:**
- `@siren/cli` → `@siren/language` + `@siren/core`
- `@siren/web` → `@siren/core` (minimal; add `@siren/language` when parsing is needed)

---

### Phase 1: Unified Diagnostics Foundation

1. **Define `DiagnosticBase` in core** — Create `packages/core/src/ir/diagnostics.ts` with the shared shape `{ code, severity, file?, line?, column? }` and no `message`.
2. **Extend semantic diagnostics** — Make `DanglingDependencyDiagnostic`, `CircularDependencyDiagnostic`, and `DuplicateIdDiagnostic` in `packages/core/src/ir/context.ts` extend `DiagnosticBase`. Keep W004–W006 unchanged here; renumbering happens with the language decoder move.
3. **Verify** — `yarn workspace @siren/core tsc --noEmit` + `yarn workspace @siren/core test`.

### Phase 2: IRExporter Interface and Prepare Core for Decoupling

4. **Define `IRExporter` in core** — Create `packages/core/src/ir/exporter.ts` with `IRExporter { export(ctx: IRContext): string }` and export it from `packages/core/src/index.ts`.
5. **Relocate `Origin`** — Move `Origin` from `packages/core/src/parser/cst.ts` into `packages/core/src/ir/types.ts`; keep a temporary re-export in `cst.ts`.
6. **Remove `IRContext.fromCst()`** — Delete the static bridge and `parseDiagnostics` from `IRContext`; `IRContext.fromResources()` becomes the sole factory. Parse diagnostics remain language-owned and are returned separately later.
7. **Verify** — Core should compile without parser/decoder imports.

### Phase 3: Create `@siren/language` Package

10. **Scaffold package** — Create `packages/language/` with `package.json` (name `@siren/language`, dep on `@siren/core: workspace:*`), `tsconfig.json`, `vitest.config.ts` (node env). Register in root `package.json` workspaces array. `yarn install`. *Parallel with step 11.*
11. **Move grammar** — `packages/core/grammar/` → `packages/language/grammar/`. Update grammar-related scripts in language `package.json`. *Parallel with step 10.*
12. **Move parser source** — `packages/core/src/parser/` → `packages/language/src/parser/` (adapter.ts, factory.ts, cst.ts, source-index.ts, index.ts). Update `cst.ts`: import `Origin` from `@siren/core` (instead of `../ir/types.js`). Remove temporary re-export. *Depends on 10.*
13. **Move decoder and rename all diagnostic codes** — `packages/core/src/decoder/` → `packages/language/src/decoder/` (index.ts, xfail.ts). Update imports to use local CST types and `@siren/core`. Rename language-phase codes W001→WL001, W002→WL002, W003→WL003, E001→EL001, and renumber core semantic codes W004→W001, W005→W002, W006→W003 in the same commit.
14. **Move ALL export logic** — Move `packages/core/src/export/` → `packages/language/src/export/`. `siren-exporter.ts` implements `IRExporter`; `exportWithComments` stays standalone; `formatters.ts` moves as-is.
15. **Create `createIRContextFromCst()` bridge** — New `packages/language/src/context-factory.ts`. It calls `decodeDocument()` and `IRContext.fromResources()` and returns `{ context, parseDiagnostics }`.
16. **Create public API** — `packages/language/src/index.ts` exports parser types (`createParserFactory`, `ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, `CommentToken`), CST types, decoder, comments, exporters (`SirenExporter`, `exportWithComments`), formatters, and the bridge.

### Phase 4: Update Consumers

17. **Trim core exports** — Remove parser, decoder, and export/formatter re-exports from `packages/core/src/index.ts`; keep IR/core types, `IRContext`, `IRExporter`, `DiagnosticBase`, semantic diagnostics, utilities, type guards, and `version`. Delete the moved `packages/core/src/parser/`, `packages/core/src/decoder/`, and `packages/core/src/export/` directories.
18. **Update CLI imports** — Add `"@siren/language": "workspace:*"` to `apps/cli/package.json`, switch parser/export/bridge imports to `@siren/language`, keep IR/diagnostic imports from `@siren/core`, replace `IRContext.fromCst()` with `createIRContextFromCst()`, and resolve the WASM from the language package instead of guessing paths.
19. **Update CLI diagnostics** — Refresh `apps/cli/src/format-diagnostics.ts` for the new code names (including W003's `secondLine` / `secondColumn` case) and update `apps/cli/src/project.ts` to combine `parseDiagnostics` with `ir.diagnostics`.

### Phase 5: Move Tests & Fixtures

20. **Move parser/decoder/export tests** — Relocate them to `packages/language/`.
21. **Move fixtures** — Move snippet fixtures to `packages/language/test/fixtures/snippets/` and add language project fixtures under `packages/language/test/fixtures/projects/`.
22. **Split integration tests and helpers** — Move parse→decode→IR flow tests/helpers to language; keep IR-only ones in core. Re-check `packages/core/test/factory.test.ts` and `packages/core/test/milestone.test.ts` for import fallout.
23. **Update CLI test infrastructure** — Refresh `apps/cli/src/adapter/node-parser-adapter.test.ts`, `apps/cli/test/helpers/test-utils.ts`, and the golden files for WL001–WL003, EL001, and core W001–W003.

### Phase 6: Cleanup & Verify

24. **Delete emptied directories** — Remove the emptied `packages/core/src/parser/`, `packages/core/src/decoder/`, and `packages/core/src/export/` directories.
25. **Update documentation** — Refresh the root README, `.github/copilot-instructions.md`, `AGENTS.md`, and `packages/core/STATUS.md` where they describe the old layout.
26. **Verify isolation** — Confirm core no longer imports parser/decoder/export code and language only imports from core where intended.
27. **Run the full test suite** — `yarn workspace @siren/core test`, `yarn workspace @siren/language test`, `yarn workspace @siren/cli test`, then `yarn workspaces foreach -pv run test`.

---

**Relevant files**

### Core (to modify)
- `packages/core/src/ir/types.ts` — shared IR types and `Origin`
- `packages/core/src/ir/context.ts` — remove `fromCst()`/`parseDiagnostics`, extend diagnostics, renumber W004–W006 → W001–W003
- `packages/core/src/ir/diagnostics.ts` — `DiagnosticBase`
- `packages/core/src/ir/exporter.ts` — `IRExporter`
- `packages/core/src/index.ts` — trim parser/decoder/export re-exports
- `packages/core/package.json` — no dep changes

### Language (to create)
- `packages/language/package.json` — new
- `packages/language/tsconfig.json` — new
- `packages/language/vitest.config.ts` — new
- `packages/language/src/index.ts` — public API
- `packages/language/src/parser/*` — moved from core
- `packages/language/src/decoder/*` — moved from core (codes renamed WL/EL)
- `packages/language/src/export/*` — moved from core (entire directory)
- `packages/language/src/context-factory.ts` — new bridge function returning `{ context, parseDiagnostics }`
- `packages/language/grammar/` — moved from core

### CLI (to update)
- `apps/cli/package.json` — add `@siren/language` dep
- `apps/cli/src/adapter/node-parser-adapter.ts` — imports and WASM path
- `apps/cli/src/parser.ts` — imports
- `apps/cli/src/project.ts` — `fromCst` → `createIRContextFromCst`, combine parse diagnostics with IR diagnostics
- `apps/cli/src/commands/format.ts` — `fromCst` replacement
- `apps/cli/src/format-diagnostics.ts` — update import sources and code literals; keep per-code message assembly
- `apps/cli/src/format-parse-error.ts` — `ParseError` import source
- `apps/cli/test/expected/*.txt` — update all diagnostic codes: language codes W001→WL001, W002→WL002, W003→WL003, E001→EL001; core codes W004→W001, W005→W002, W006→W003.

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
- **No `DiagnosticsBag` class** — Core only defines `DiagnosticBase`; parse diagnostics stay as a plain array.
- **IRExporter is document-level** — `export(ctx: IRContext): string`; each implementation owns its walk and formatting.
- **`DiagnosticBase` carries no `message` field** — Frontends assemble display text from structured fields, and `ParseDiagnostic` may keep its own `message` internally.
- **Language diagnostic code prefix: `L`** — W001→WL001, E001→EL001, with core semantic codes renumbered W004–W006 → W001–W003 in Phase 3 step 13.
- **`Origin` relocates to core** — positional metadata, not grammar-specific; the temporary re-export in `cst.ts` is only for the transition.
- **`ParseDiagnostic` remains in language** — it structurally satisfies `DiagnosticBase`, but its definition and creation remain in `@siren/language`.
- **`IRContext.fromCst()` replaced by `createIRContextFromCst()` in language** — the sole bridge between parsing and the IR layer.
- **Phased PRs to main are acceptable** — transient breakage is fine if the phases land in order and quickly.
- **Scope excluded** — no grammar changes, no new features.

**Further Considerations**
0. **Delete `packages/parser/` before this plan begins** — Orphaned ghost directory; delete it in a separate PR before Phase 1.
1. **Golden file updates** — The diagnostic-code changes are mechanical and should land with Phase 3 step 13.
2. **W003 position formatting** — `formatPrefix()` still needs special handling for W003 because it uses `secondLine`/`secondColumn`.
3. **Parse ordering** — Combined diagnostic ordering is an implementation detail; golden files are authoritative.
4. **Parser factory test fixtures** — WASM-loading tests in language's vitest config may need special setup.
5. **Core test helpers** — `packages/core/test/helpers/` may need to move or be rewritten to build IR directly.
6. **CLI tsup bundle** — Verify the bundle resolves both `@siren/core` and `@siren/language` workspace imports.
