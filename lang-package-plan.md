## Plan: Extract `@sirenpm/language` from `@sirenpm/core`

Split parser/grammar/decoding and all export logic from `packages/core` into `packages/language` (`@sirenpm/language`). Core keeps IR types, semantic validation, utilities, `DiagnosticBase`, and `IRExporter`; language owns grammar, CST types, parser factory, decoder (CST→IR), comment classification, exporters, and formatters. `web-tree-sitter` is a direct dependency of `@sirenpm/language`; the language package owns WASM initialization internally and provides a zero-config `createParser()`. Dependency stays one-way: `@sirenpm/language` → `@sirenpm/core`.

`DiagnosticBase` is message-free, and parse diagnostics stay in language and are surfaced separately from `IRContext`.

**Architecture after split:**
```
@sirenpm/language (packages/language/)
  ├── grammar/         ← tree-sitter grammar definition + WASM
  ├── src/
  │   ├── parser/      ← adapter interface, factory (owns web-tree-sitter init), CST types, source-index
  │   ├── decoder/     ← CST→IR transformation, language-phase diagnostics (WL/EL codes)
  │   └── export/      ← ALL exporters (exportToSiren, exportWithComments) + formatters
  depends on: @sirenpm/core (IR types, IRExporter interface, DiagnosticBase), web-tree-sitter

@sirenpm/core (packages/core/)
  ├── src/
  │   ├── ir/          ← types, IRContext, semantic diagnostics (W001-W003), Origin,
  │   │                  DiagnosticBase, IRExporter interface
  │   └── utilities/   ← graph, dependency-tree, milestone, entry
  depends on: nothing
```

**Consumer dependency graph:**
- `@sirenpm/cli` → `@sirenpm/language` + `@sirenpm/core` (CLI no longer needs `web-tree-sitter` directly)
- `@sirenpm/web` → `@sirenpm/core` (minimal; add `@sirenpm/language` when parsing is needed — browser-side `tree-sitter.wasm` engine loading is a deferred Vite config concern)

**Release cadence.** Client packages consume `@sirenpm/*` via pinned npm versions (not `workspace:*`). That lets each package ship in isolation:

1. **Release 1 — `@sirenpm/core`** refactored, tested standalone, published to npm via GitHub CI.
2. **Release 2 — `@sirenpm/language`** created as a new package consuming the published `@sirenpm/core`, tested standalone, published to npm.
3. **Release 3 — `@sirenpm/cli`** bumps its pinned deps, migrates to the new APIs, ships.
4. **Release 4 — Docs/cleanup.**

**Staging document rule.** Whenever a phase *removes* working code from one package that must be *re-added* in a later phase (e.g. parser/decoder/export sources, helpers, fixtures, tests), that phase MUST append the removed paths and any contextual notes to a top-level staging file, `lang-package-migration-staging.md`, so the original working implementation is recoverable when the later phase needs to port it. The staging file is created at the start of Release 1 and deleted at the end of Release 4.

---

## Release 1 — `@sirenpm/core` refactor (target: v0.2.0)

Goal: core compiles, tests, and publishes without any parser/decoder/export code. CLI is untouched and remains pinned to `@sirenpm/core@0.1.0` until Release 3.

### Phase 1.0: Prework

1. **Delete orphaned `packages/parser/`** — separate PR before Phase 1.1.
2. **Create staging doc** — add `lang-package-migration-staging.md` at repo root with sections: "Release 2 port targets" (files to move to `@sirenpm/language`) and "Release 3 port targets" (CLI changes). All subsequent removal steps append to it.

### Phase 1.1: Unified Diagnostics Foundation

3. **Define `DiagnosticBase` in core** — Create `packages/core/src/ir/diagnostics.ts` with `{ code, severity, file?, line?, column? }` (no `message`).
4. **Extend semantic diagnostics** — Make `DanglingDependencyDiagnostic`, `CircularDependencyDiagnostic`, and `DuplicateIdDiagnostic` in `packages/core/src/ir/context.ts` extend `DiagnosticBase`.
5. **Renumber core semantic codes** — W004→W001, W005→W002, W006→W003. Safe to do now because language-phase codes are about to leave core; no collision risk.

### Phase 1.2: IRExporter Interface and Origin Relocation

6. **Define `IRExporter` in core** — Create `packages/core/src/ir/exporter.ts` with `interface IRExporter { export(ctx: IRContext): string }`; export from `packages/core/src/index.ts`.
7. **Relocate `Origin`** — Move `Origin` from `packages/core/src/parser/cst.ts` into `packages/core/src/ir/types.ts`. No temporary re-export needed — `parser/` is about to be deleted; record the new canonical location in the staging doc so Release 2's `cst.ts` port knows to import it from `@sirenpm/core`.

### Phase 1.3: Remove parser/decoder/export from core

8. **Record to staging doc** — Before deleting anything, append to `lang-package-migration-staging.md` under "Release 2 port targets":
   - File inventory of `packages/core/src/parser/` (adapter.ts, factory.ts, cst.ts, source-index.ts, index.ts) with a note that `factory.ts` is to be rewritten (no DI; direct `web-tree-sitter` import; `createParser()` owns init; WASM via `new URL(...)`).
   - File inventory of `packages/core/src/decoder/` (index.ts, xfail.ts) with the code-rename map W001→WL001, W002→WL002, W003→WL003, E001→EL001.
   - File inventory of `packages/core/src/export/` (siren-exporter.ts, exportWithComments, formatters.ts) with a note that `siren-exporter.ts` must implement `IRExporter`.
   - Note: `IRContext.fromCst()` is being removed; Release 2 replaces it with `createIRContextFromCst()` in `packages/language/src/context-factory.ts` returning `{ context, parseDiagnostics }`.
9. **Remove `IRContext.fromCst()`** — Delete the static bridge and `parseDiagnostics` from `IRContext` in `packages/core/src/ir/context.ts`. `IRContext.fromResources()` becomes the sole factory.
10. **Delete source directories** — `packages/core/src/parser/`, `packages/core/src/decoder/`, `packages/core/src/export/`.
11. **Trim core exports** — `packages/core/src/index.ts` keeps IR/core types, `IRContext`, `IRExporter`, `DiagnosticBase`, semantic diagnostics, utilities, type guards, `version`.
12. **Drop `web-tree-sitter`** — remove from `packages/core/package.json` devDependencies.

### Phase 1.4: Test triage (core-only)

13. **Record to staging doc** — Append to "Release 2 port targets" a list of every test file and helper being moved out of `packages/core/test/`, with one-line descriptions:
    - `packages/core/test/helpers/node-adapter.ts` (~520 lines — full `NodeParserAdapter` test impl with CST conversion).
    - `packages/core/test/helpers/parser.ts` (~70 lines — `getTestAdapter()`/`doc()` wrappers).
    - `packages/core/test/integration/node-adapter.test.ts`, `fixtures.test.ts`, `decode-fixtures.test.ts`, all project integration tests.
    - Snippet fixtures under `packages/core/test/fixtures/snippets/`.
    - Project fixtures that exercise decoding/parsing (enumerate which ones — some may remain in core if they only exercise IR).
    - `packages/core/src/exporter.test.ts` and any remaining parser/decoder/export unit tests.
14. **Relocate to staging area** — Move the files above to `staging/language-tests/` at repo root (or a feature branch held open for Release 2). Gitignore from core's vitest config so they don't run during Release 1.
15. **Rewrite residual core tests** — Any surviving test in `packages/core/test/` (e.g. `factory.test.ts`, `milestone.test.ts`) that still used `IRContext.fromCst()` is rewritten to build IR directly via `IRContext.fromResources()`.
16. **Verify core in isolation:**
    - `yarn workspace @sirenpm/core tsc --noEmit`
    - `yarn workspace @sirenpm/core test`
    - `grep -r "parser/\|decoder/\|export/" packages/core/src/` → empty
    - `grep -r "web-tree-sitter" packages/core/` → empty

### Phase 1.5: Release

17. **Changeset** — `@sirenpm/core` major bump (breaking: removed parser/decoder/export, renumbered diagnostics, removed `fromCst`). Likely `0.2.0`.
18. **Merge + publish** — `release-core.yml` publishes `@sirenpm/core@0.2.0` to npm.

**Release 1 exit criteria:** `@sirenpm/core@0.2.0` on npm; core tests pass with no parser/decoder/export code remaining; staging doc enumerates every piece of working code awaiting re-introduction in later releases.

---

## Release 2 — `@sirenpm/language` (target: v0.1.0)

New package consuming the freshly-published `@sirenpm/core@^0.2.0` from npm.

### Phase 2.1: Package scaffold

19. **Create `packages/language/`** with:
    - `package.json` — name `@sirenpm/language`, dependencies `"@sirenpm/core": "^0.2.0"` (**npm pin, not `workspace:*`**) and `"web-tree-sitter": "^0.26.3"`.
    - `tsconfig.json`, `vitest.config.ts` (node env).
    - Register `packages/language` in root `package.json` workspaces.
    - `yarn install`.

### Phase 2.2: Port grammar + parser (consume staging doc)

20. **Move grammar** — `packages/core/grammar/` (or its last-known path from staging doc) → `packages/language/grammar/`. Update grammar scripts in language `package.json`. Ensure `grammar/tree-sitter-siren.wasm` is included in `package.json` `files` glob.
21. **Port parser source** — Restore `adapter.ts`, `cst.ts`, `source-index.ts`, `index.ts` into `packages/language/src/parser/` from staging. `cst.ts` imports `Origin` from `@sirenpm/core`.
22. **Rewrite `factory.ts`** — delete `ParserFactoryInit`, `ParserLike`, `LanguageLike`, `loadWasm`. Import `Parser` and `Language` from `web-tree-sitter` directly. Resolve grammar WASM via `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)`. Export zero-config `createParser()` that calls `Parser.init()` + `Language.load()` internally and returns a `ParserAdapter`.

### Phase 2.3: Port decoder + exporters (consume staging doc)

23. **Port decoder** — Restore `index.ts`, `xfail.ts` into `packages/language/src/decoder/` from staging. Apply the code rename map (W001→WL001, W002→WL002, W003→WL003, E001→EL001). Update imports to use local CST types and `@sirenpm/core` IR types.
24. **Port export logic** — Restore `packages/language/src/export/` from staging. `siren-exporter.ts` implements `IRExporter` from `@sirenpm/core`. `exportWithComments` stays standalone; `formatters.ts` moves as-is.
25. **Create `createIRContextFromCst()` bridge** — New `packages/language/src/context-factory.ts` calling `decodeDocument()` and `IRContext.fromResources()`, returning `{ context, parseDiagnostics }`.
26. **Create public API** — `packages/language/src/index.ts` exports `createParser`, `ParserAdapter`, `ParseResult`, `ParseError`, `SourceDocument`, `CommentToken`, CST types, decoder, comments, exporters (`SirenExporter`, `exportWithComments`), formatters, and the bridge.

### Phase 2.4: Port tests + fixtures (consume staging doc)

27. **Move helpers** — Restore `node-adapter.ts` and `parser.ts` into `packages/language/test/helpers/`. Simplify: they now wrap `createParser()` directly.
28. **Move fixtures** — Snippet fixtures → `packages/language/test/fixtures/snippets/`; decoding-exercising project fixtures → `packages/language/test/fixtures/projects/`.
29. **Move integration + unit tests** — `node-adapter.test.ts`, `fixtures.test.ts`, `decode-fixtures.test.ts`, project integration tests, exporter tests (ex-`packages/core/src/exporter.test.ts`). Update diagnostic-code assertions to WL001–WL003, EL001, and core-renumbered W001–W003.

### Phase 2.5: Verify + release

30. **Verify:**
    - `yarn workspace @sirenpm/language tsc --noEmit`
    - `yarn workspace @sirenpm/language test`
    - `grep -r "@sirenpm/language" packages/core/src/` → empty (no reverse dep).
    - Language resolves `@sirenpm/core` from npm, not workspace.
31. **Add CI release workflow** — `.github/workflows/release-language.yml` mirroring `release-core.yml`.
32. **Changeset + publish** — `@sirenpm/language@0.1.0` via CI.
33. **Update staging doc** — Tick off the "Release 2 port targets" section, leaving "Release 3 port targets" intact.

**Release 2 exit criteria:** `@sirenpm/language@0.1.0` on npm; parse/decode/export tests pass inside the language package; staging doc reflects completion.

---

## Release 3 — `@sirenpm/cli` migration

### Phase 3.1: Record + swap dependencies

34. **Append to staging doc** — Under "Release 3 port targets", confirm the CLI change list (code edits and golden-file regenerations) is complete; this was populated during Release 1 Phase 1.3.
35. **Update `apps/cli/package.json`** — bump `"@sirenpm/core": "^0.2.0"`, add `"@sirenpm/language": "^0.1.0"`, remove `"web-tree-sitter"` (now transitive). `yarn install`.

### Phase 3.2: Code updates

36. **Delete `apps/cli/src/adapter/node-parser-adapter.ts`** — the CLI calls `createParser()` from `@sirenpm/language` (zero-config).
37. **Update CLI imports** — `apps/cli/src/parser.ts`, `apps/cli/src/project.ts`, `apps/cli/src/commands/format.ts`: switch parser/export/bridge imports to `@sirenpm/language`; keep IR/diagnostic imports from `@sirenpm/core`; replace `IRContext.fromCst()` with `createIRContextFromCst()`; combine returned `parseDiagnostics` with `ir.diagnostics`.
38. **Update diagnostic formatting** — `apps/cli/src/format-diagnostics.ts` uses new code literals (WL001–WL003, EL001, core W001–W003). Preserve WL003's `secondLine`/`secondColumn` special case in `formatPrefix()`.
39. **Update `ParseError` import source** — `apps/cli/src/format-parse-error.ts` now imports from `@sirenpm/language`.

### Phase 3.3: Test updates

40. **Refresh CLI test infrastructure** — Refresh or delete `apps/cli/src/adapter/node-parser-adapter.test.ts` (likely delete since the adapter is gone) and `apps/cli/test/helpers/test-utils.ts`.
41. **Regenerate golden files** — Every `apps/cli/test/expected/*.txt` touching diagnostics is updated for WL001–WL003, EL001, and core W001–W003.
42. **Verify:**
    - `yarn workspace @sirenpm/cli tsc --noEmit`
    - `yarn workspace @sirenpm/cli test`
    - tsup bundle resolves both `@sirenpm/core` and `@sirenpm/language` cleanly from npm.

### Phase 3.4: Release

43. **Changeset + publish** — `@sirenpm/cli` minor bump, merge, publish.

---

## Release 4 — Cleanup & Docs

44. **Delete staging artifacts** — Remove `staging/language-tests/` if it still exists.
45. **Delete staging doc** — `lang-package-migration-staging.md` is no longer needed; remove it.
46. **Update documentation** — Refresh the root README, `.github/copilot-instructions.md`, `AGENTS.md`, and `packages/core/STATUS.md` for the three-package layout and npm-pinned consumers.
47. **Verify isolation** — Core no longer imports parser/decoder/export; language imports from `@sirenpm/core` only where intended.
48. **Run the full test suite** — `yarn workspace @sirenpm/core test`, `yarn workspace @sirenpm/language test`, `yarn workspace @sirenpm/cli test`, then `yarn workspaces foreach -pv run test`.

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
- `apps/cli/package.json` — add `@sirenpm/language` dep, remove `web-tree-sitter` dep
- `apps/cli/src/adapter/node-parser-adapter.ts` — **delete entirely** (replaced by `createParser()` from `@sirenpm/language`)
- `apps/cli/src/parser.ts` — imports
- `apps/cli/src/project.ts` — `fromCst` → `createIRContextFromCst`, combine parse diagnostics with IR diagnostics
- `apps/cli/src/commands/format.ts` — `fromCst` replacement
- `apps/cli/src/format-diagnostics.ts` — update import sources and code literals; keep per-code message assembly
- `apps/cli/src/format-parse-error.ts` — `ParseError` import source
- `apps/cli/test/expected/*.txt` — update all diagnostic codes: language codes W001→WL001, W002→WL002, W003→WL003, E001→EL001; core codes W004→W001, W005→W002, W006→W003.

**Verification gates (per release)**

| Gate | Command / check | Release |
|---|---|---|
| Core compiles standalone | `yarn workspace @sirenpm/core tsc --noEmit` | 1 |
| Core tests pass standalone | `yarn workspace @sirenpm/core test` | 1 |
| Core free of parser/decoder/export | `grep -r "parser/\|decoder/\|export/" packages/core/src/` empty | 1 |
| Core free of web-tree-sitter | `grep -r "web-tree-sitter" packages/core/` empty | 1 |
| Core published | `@sirenpm/core@0.2.0` on npm | 1 |
| Language compiles | `yarn workspace @sirenpm/language tsc --noEmit` | 2 |
| Language tests pass | `yarn workspace @sirenpm/language test` | 2 |
| No reverse dep | `grep -r "@sirenpm/language" packages/core/src/` empty | 2 |
| Language consumes core via npm pin | inspect `packages/language/package.json` | 2 |
| Language published | `@sirenpm/language@0.1.0` on npm | 2 |
| CLI compiles | `yarn workspace @sirenpm/cli tsc --noEmit` | 3 |
| CLI tests pass | `yarn workspace @sirenpm/cli test` | 3 |
| CLI bundle resolves npm deps | tsup build succeeds | 3 |
| Full suite green | `yarn workspaces foreach -pv run test` | 4 |

**Decisions**
- **Sequential, release-gated migration** — Each package is refactored, tested, and published in isolation; npm-pinned consumers absorb the blast radius of breaking changes.
- **Core v0.2.0 is breaking** — removed parser/decoder/export, renumbered W004–W006 → W001–W003, removed `IRContext.fromCst()`.
- **Staging doc is mandatory** — `lang-package-migration-staging.md` tracks every piece of working code removed during Release 1 that must be re-introduced in Releases 2–3. It is the single source of truth for "what needs to move where" across PR boundaries.
- **Diagnostic renumber lands in Release 1** — no collision risk once language-phase codes leave core.
- **Parse-dependent tests are parked during Release 1** — relocated to `staging/language-tests/` (or a feature branch), ported to `@sirenpm/language` in Release 2.
- **`@sirenpm/language` consumes `@sirenpm/core` via npm pin** — matches the new monorepo norm; no `workspace:*`.
- **Zero-config `createParser()` in language** — DI ceremony eliminated; `web-tree-sitter` is a direct language dep; grammar WASM resolved via `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)`. Emscripten engine WASM loads automatically in Node.
- **CLI loses `web-tree-sitter` dep** — transitive via `@sirenpm/language`; `node-parser-adapter.ts` deleted.
- **No `DiagnosticsBag` class** — core only defines `DiagnosticBase`; parse diagnostics stay as a plain array.
- **IRExporter is document-level** — `export(ctx: IRContext): string`.
- **`DiagnosticBase` carries no `message`** — frontends assemble display text from structured fields; `ParseDiagnostic` may keep its own internal `message`.
- **`Origin` relocates to core** — positional metadata, not grammar-specific.
- **`ParseDiagnostic` stays in language** — structurally satisfies `DiagnosticBase` but defined and constructed in `@sirenpm/language`.
- **Browser engine WASM (deferred)** — `@sirenpm/web` handles via Vite config when it adds parsing; not a language-package concern.
- **Scope excluded** — no grammar changes, no new features.

**Further considerations**
1. **Staging location for Release 1's displaced tests** — recommend `staging/language-tests/` at repo root, gitignored from core's vitest config. Alternative: a feature branch held open until Release 2 lands.
2. **Staging doc format** — plain markdown with two top-level sections ("Release 2 port targets", "Release 3 port targets"), each listing files with short context notes. Phase 1.3 and 1.4 are the primary authors; Phase 2.2–2.4 and Phase 3.x are the consumers.
3. **CI workflow for language** — mirror `release-core.yml` in Phase 2.5 before the first publish.
4. **Changeset clarity** — core's changeset must enumerate the breaking surface so CLI + future web consumers plan bumps.
5. **W003 → WL003 position formatting** — `formatPrefix()` in CLI still needs special handling for `secondLine`/`secondColumn` under the new code name.
6. **Grammar WASM packaging** — ensure `packages/language/package.json` `files` glob includes `grammar/tree-sitter-siren.wasm`.
7. **tsup bundle after swap** — verify CLI resolves both `@sirenpm/core` and `@sirenpm/language` from npm cleanly; no `noExternal` surprises.
8. **Parse ordering** — combined diagnostic ordering in CLI output is an implementation detail; golden files are authoritative.
