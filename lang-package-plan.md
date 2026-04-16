## Plan: Extract `@siren/language` from `@siren/core`

Split parser/grammar/decoding and all export logic from `packages/core` into `packages/language` (`@siren/language`). Core keeps IR types, semantic validation, utilities, `DiagnosticBase`, and `IRExporter`; language owns grammar, CST types, parser factory, decoder (CST→IR), comment classification, exporters, and formatters. `web-tree-sitter` is a direct dependency of `@siren/language`; the language package owns WASM initialization internally and provides a zero-config `createParser()`. Dependency stays one-way: `@siren/language` → `@siren/core`.

`DiagnosticBase` is message-free, and parse diagnostics stay in language and are surfaced separately from `IRContext`.

**Architecture after split:**
```
@siren/language (packages/language/)
  ├── grammar/         ← tree-sitter grammar definition + WASM
  ├── src/
  │   ├── parser/      ← adapter interface, factory (owns web-tree-sitter init), CST types, source-index
  │   ├── decoder/     ← CST→IR transformation, language-phase diagnostics (WL/EL codes)
  │   └── export/      ← ALL exporters (exportToSiren, exportWithComments) + formatters
  depends on: @siren/core (IR types, IRExporter interface, DiagnosticBase), web-tree-sitter

@siren/core (packages/core/)
  ├── src/
  │   ├── ir/          ← types, IRContext, semantic diagnostics (W001-W003), Origin,
  │   │                  DiagnosticBase, IRExporter interface
  │   └── utilities/   ← graph, dependency-tree, milestone, entry
  depends on: nothing
```

**Consumer dependency graph:**
- `@siren/cli` → `@siren/language` + `@siren/core` (CLI no longer needs `web-tree-sitter` directly)
- `@siren/web` → `@siren/core` (minimal; add `@siren/language` when parsing is needed — browser-side `tree-sitter.wasm` engine loading is a deferred Vite config concern)

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

8. **Scaffold package** — Create `packages/language/` with `package.json` (name `@siren/language`, deps on `@siren/core: workspace:*` and `web-tree-sitter: ^0.26.3`), `tsconfig.json`, `vitest.config.ts` (node env). Register in root `package.json` workspaces array. `yarn install`.
9. **Move grammar** — `packages/core/grammar/` → `packages/language/grammar/`. Update grammar-related scripts in language `package.json`.
10. **Move parser source and replace DI with direct initialization** — `packages/core/src/parser/` → `packages/language/src/parser/` (adapter.ts, factory.ts, cst.ts, source-index.ts, index.ts). Update `cst.ts`: import `Origin` from `@siren/core` (instead of `../ir/types.js`). Remove temporary re-export. Rewrite `factory.ts`: delete `ParserFactoryInit`, `ParserLike`, `LanguageLike`, and the `loadWasm` callback. Import `Parser` and `Language` from `web-tree-sitter` directly. Resolve grammar WASM via `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)`. Export a zero-config `createParser()` that calls `Parser.init()` + `Language.load()` internally and returns a `ParserAdapter`.
11. **Move decoder and rename all diagnostic codes** — `packages/core/src/decoder/` → `packages/language/src/decoder/` (index.ts, xfail.ts). Update imports to use local CST types and `@siren/core`. Rename language-phase codes W001→WL001, W002→WL002, W003→WL003, E001→EL001, and renumber core semantic codes W004→W001, W005→W002, W006→W003 in the same commit.
12. **Move ALL export logic** — Move `packages/core/src/export/` → `packages/language/src/export/`. `siren-exporter.ts` implements `IRExporter`; `exportWithComments` stays standalone; `formatters.ts` moves as-is.
13. **Create `createIRContextFromCst()` bridge** — New `packages/language/src/context-factory.ts`. It calls `decodeDocument()` and `IRContext.fromResources()` and returns `{ context, parseDiagnostics }`.
14. **Create public API** — `packages/language/src/index.ts` exports `createParser`, `ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, `CommentToken`, CST types, decoder, comments, exporters (`SirenExporter`, `exportWithComments`), formatters, and the bridge.

### Phase 4: Update Consumers

15. **Trim core exports** — Remove parser, decoder, and export/formatter re-exports from `packages/core/src/index.ts`; keep IR/core types, `IRContext`, `IRExporter`, `DiagnosticBase`, semantic diagnostics, utilities, type guards, and `version`. Delete the moved `packages/core/src/parser/`, `packages/core/src/decoder/`, and `packages/core/src/export/` directories.
16. **Update CLI imports** — Add `"@siren/language": "workspace:*"` to `apps/cli/package.json` and **remove `web-tree-sitter`** from CLI dependencies (it's now transitive through `@siren/language`). Switch parser/export/bridge imports to `@siren/language`, keep IR/diagnostic imports from `@siren/core`, replace `IRContext.fromCst()` with `createIRContextFromCst()`. Delete `apps/cli/src/adapter/node-parser-adapter.ts` entirely — the CLI calls `createParser()` from `@siren/language` (zero-config, no `resolveWasmPath`, no DI callback).
17. **Update CLI diagnostics** — Refresh `apps/cli/src/format-diagnostics.ts` for the new code names (including W003's `secondLine` / `secondColumn` case) and update `apps/cli/src/project.ts` to combine `parseDiagnostics` with `ir.diagnostics`.

### Phase 5: Move Tests & Fixtures

18. **Move parser/decoder/export tests** — Relocate them to `packages/language/`.
19. **Move fixtures** — Move snippet fixtures to `packages/language/test/fixtures/snippets/` and add language project fixtures under `packages/language/test/fixtures/projects/`.
20. **Split integration tests and helpers** — Move parse→decode→IR flow tests/helpers to language; keep IR-only ones in core. Specifically: move `packages/core/test/helpers/node-adapter.ts` (~520 lines, full `NodeParserAdapter` implementation with CST conversion) and `packages/core/test/helpers/parser.ts` (~70 lines, `getTestAdapter()`/`doc()` wrappers) to `packages/language/test/helpers/`. These are imported by `node-adapter.test.ts`, `fixtures.test.ts`, `decode-fixtures.test.ts`, and all project integration tests — all of which move to language. Re-check `packages/core/test/factory.test.ts` and `packages/core/test/milestone.test.ts` for import fallout.
21. **Update CLI test infrastructure** — Refresh `apps/cli/src/adapter/node-parser-adapter.test.ts`, `apps/cli/test/helpers/test-utils.ts`, and the golden files for WL001–WL003, EL001, and core W001–W003.

### Phase 6: Cleanup & Verify

22. **Delete emptied directories** — Remove the emptied `packages/core/src/parser/`, `packages/core/src/decoder/`, and `packages/core/src/export/` directories.
23. **Update documentation** — Refresh the root README, `.github/copilot-instructions.md`, `AGENTS.md`, and `packages/core/STATUS.md` where they describe the old layout.
24. **Verify isolation** — Confirm core no longer imports parser/decoder/export code and language only imports from core where intended.
25. **Run the full test suite** — `yarn workspace @siren/core test`, `yarn workspace @siren/language test`, `yarn workspace @siren/cli test`, then `yarn workspaces foreach -pv run test`.

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
- `packages/language/package.json` — new (declares `web-tree-sitter` as runtime dep)
- `packages/language/tsconfig.json` — new
- `packages/language/vitest.config.ts` — new
- `packages/language/src/index.ts` — public API (exports `createParser` instead of `createParserFactory`)
- `packages/language/src/parser/*` — moved from core; `factory.ts` rewritten to own `web-tree-sitter` init directly
- `packages/language/src/decoder/*` — moved from core (codes renamed WL/EL)
- `packages/language/src/export/*` — moved from core (entire directory)
- `packages/language/src/context-factory.ts` — new bridge function returning `{ context, parseDiagnostics }`
- `packages/language/grammar/` — moved from core
- `packages/language/test/helpers/node-adapter.ts` — moved from `packages/core/test/helpers/` (~520 lines, full `NodeParserAdapter` test impl)
- `packages/language/test/helpers/parser.ts` — moved from `packages/core/test/helpers/` (~70 lines, `getTestAdapter()`/`doc()` wrappers)

### CLI (to update)
- `apps/cli/package.json` — add `@siren/language` dep, remove `web-tree-sitter` dep
- `apps/cli/src/adapter/node-parser-adapter.ts` — **delete entirely** (replaced by `createParser()` from `@siren/language`)
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
- **`web-tree-sitter` is a direct dependency of `@siren/language`** — The language package imports `Parser` and `Language` from `web-tree-sitter` and owns WASM initialization. The grammar WASM is resolved via `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)` — a stable package-relative path that works in both Node ESM and browser bundlers. `Parser.init()` is called bare (no `locateFile`); in Node this works out of the box because Emscripten's runtime reads `tree-sitter.wasm` via `fs` from its own `node_modules`. For browser consumers (when the web app eventually needs parsing), serving the engine WASM is a one-line Vite config concern (`postinstall` copy to `public/` or `?url` import) — not something the language package needs to abstract over. The DI ceremony (`ParserFactoryInit`, `loadWasm`, `LanguageLike`, `ParserLike`) is eliminated. CLI no longer carries `web-tree-sitter` as a direct dependency.
- **Scope excluded** — no grammar changes, no new features.

**Further Considerations**
0. **Delete `packages/parser/` before this plan begins** — Orphaned ghost directory; delete it in a separate PR before Phase 1.
1. **Golden file updates** — The diagnostic-code changes are mechanical and should land with Phase 3 step 13.
2. **W003 position formatting** — `formatPrefix()` still needs special handling for W003 because it uses `secondLine`/`secondColumn`.
3. **Parse ordering** — Combined diagnostic ordering is an implementation detail; golden files are authoritative.
4. **Parser factory test fixtures** — Tests can use `createParser()` directly; no special WASM setup needed since `@siren/language` resolves it internally.
5. **Core test helpers** — `packages/core/test/helpers/node-adapter.ts` (~520 lines) and `parser.ts` (~70 lines) must move to `packages/language/test/helpers/`. With `web-tree-sitter` as a direct dep of language, these helpers simplify to thin wrappers around `createParser()`. All integration tests that use them (`node-adapter.test.ts`, `fixtures.test.ts`, `decode-fixtures.test.ts`, all project tests) move to language. Core's remaining tests (`factory.test.ts`, `milestone.test.ts`) may need rewriting to build IR directly via `IRContext.fromResources()`.
6. **Browser engine WASM (deferred)** — `Parser.init()` loads the Emscripten engine binary (`tree-sitter.wasm`). In Node this resolves automatically via `fs`. In browser environments, the engine WASM must be served at an accessible URL. This is a well-documented concern (see `web-tree-sitter` docs on `locateFile` and Vite `postinstall`) and only becomes relevant when `@siren/web` adds parsing. The language package does NOT need to solve this — the browser host handles it with a one-line Vite config or `postinstall` script.
6. **CLI tsup bundle** — Verify the bundle resolves both `@siren/core` and `@siren/language` workspace imports.
