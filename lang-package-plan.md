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

### Phase 1.0: Prework ✅

1. ~~**Delete orphaned `packages/parser/`** — separate PR before Phase 1.1.~~ ✅ Directory contained only stale build artifacts (`dist/`, `node_modules/`, `.tsbuildinfo`) — no source, no `package.json`, fully gitignored. Deleted; `yarn install` confirmed it was not a workspace member.
2. ~~**Create staging doc** — add `lang-package-migration-staging.md` at repo root with sections: "Release 2 port targets" (files to move to `@sirenpm/language`) and "Release 3 port targets" (CLI changes). All subsequent removal steps append to it.~~ ✅ Created at repo root with the two empty section skeletons.

### Phase 1.1: Unified Diagnostics Foundation ✅

3. ~~**Define `DiagnosticBase` in core** — Create `packages/core/src/ir/diagnostics.ts` with `{ code, severity, file?, line?, column? }` (no `message`).~~ ✅ Created and re-exported from `packages/core/src/index.ts`.
4. ~~**Extend semantic diagnostics** — Make `DanglingDependencyDiagnostic`, `CircularDependencyDiagnostic`, and `DuplicateIdDiagnostic` in `packages/core/src/ir/context.ts` extend `DiagnosticBase`.~~ ✅ All three extend `DiagnosticBase`. Removed redundant `file`/`line`/`column` from `Dangling`/`Circular` (inherited); `DuplicateId` retains its `firstLine`/`firstColumn`/`firstFile`/`secondLine`/`secondColumn`. No `message` field existed on any of them, so the no-message design landed cleanly.
5. ~~**Renumber core semantic codes**~~ ✅ W004→W001 (Circular), W005→W002 (Dangling), W006→W003 (Duplicate). All in-core assertion sites updated (`context.test.ts` plus five integration project tests). CLI left on old codes until Release 3 per scope. Verification: `tsc --noEmit` clean, `yarn workspace @sirenpm/core test` → 281 passed / 1 skipped, `grep W00[456] packages/core/{src,test}/` empty.

### Phase 1.2: IRExporter Interface and Origin Relocation ✅

6. ~~**Define `IRExporter` in core** — Create `packages/core/src/ir/exporter.ts` with `interface IRExporter { export(ctx: IRContext): string }`; export from `packages/core/src/index.ts`.~~ ✅ Created; re-exported from `packages/core/src/index.ts`.
7. ~~**Relocate `Origin`** — Move `Origin` from `packages/core/src/parser/cst.ts` into `packages/core/src/ir/types.ts`. No temporary re-export needed — `parser/` is about to be deleted; record the new canonical location in the staging doc so Release 2's `cst.ts` port knows to import it from `@sirenpm/core`.~~ ✅ `Origin` now lives in `ir/types.ts`; `parser/cst.ts` retains a transparent re-export for in-tree consumers until Phase 1.3 removes the directory. `source-index.ts` repointed to the new location. Staging doc updated with the canonical-location note under "Release 2 port targets". Verification: `tsc --noEmit` clean; 281 tests pass.

### Phase 1.3: Remove parser/decoder/export from core ✅

8. ~~**Record to staging doc**~~ ✅ Appended Parser/Decoder/Export source inventories + `fromCst` removal note under "Release 2 port targets"; authored all six Release 3 CLI migration entries under "Release 3 port targets".
9. ~~**Remove `IRContext.fromCst()`**~~ ✅ Deleted the static factory, the `parseDiagnostics` constructor arg, field, and getter. `fromResources(resources, source?)` is the sole factory, carrying semantic diagnostics only. Removed `ParseDiagnostic` import from `context.ts`; no internal decoder/parser coupling remained.
10. ~~**Delete source directories**~~ ✅ Removed `packages/core/src/parser/`, `packages/core/src/decoder/`, `packages/core/src/export/`, plus the colocated `src/exporter.test.ts`.
11. ~~**Trim core exports**~~ ✅ `packages/core/src/index.ts` now exports only IR types, `IRContext`, type guards, `Origin`, semantic diagnostics, `DiagnosticBase`, `IRExporter`, `DependencyTree`, utilities, `version`. All parser/decoder/export re-exports (and `ParseDiagnostic`) removed.
12. ~~**Drop `web-tree-sitter`**~~ ✅ Removed from `packages/core/package.json` devDependencies. `yarn install` clean. Residual `web-tree-sitter` references remain only in test helpers/fixtures and stale docs (`ADAPTER_EXAMPLE.md`, `STATUS.md`, `TREE_SITTER_SETUP.md`) — addressed in Phase 1.4 / Release 4.

**Verification:** `tsc --noEmit` clean; `grep parser/\\|decoder/\\|export/ packages/core/src/` empty. Tests: 91 pass / 57 fail / 11 skipped — 73 `IRContext.fromCst is not a function` + 1 missing `../src/parser/factory` module (expected input for Phase 1.4 triage).

### Phase 1.4: Test triage (core-only)

### Phase 1.4: Test triage (core-only) ✅

13. ~~**Record to staging doc**~~ ✅ Appended "Tests, helpers, and fixtures (Phase 1.4)" subsection with full inventory: 2 helpers, 3 root integration tests, 28 project tests + helper, `factory.test.ts`, 8 snippet fixtures, 34 deferred project fixtures, and a note on deleted colocated units.
14. ~~**Relocate to staging area**~~ ✅ 43 files moved to `staging/language-tests/` preserving relative paths under `test/`. Configured `biome.json` with `!staging` so lint/format skip it. Root + core `vitest.config.ts` glob scopes already exclude the directory. **Not gitignored** — tracked in git so the feature branch carries it to Release 2. **Deferred**: 34 project-fixture dirs under `packages/core/test/fixtures/projects/` stay put because `apps/cli/test/helpers/fixture-utils.ts` still references them by hardcoded relative path; CLI is out of Release 1 scope. Phase 2.4 will copy/symlink them into the language package; Phase 3.3 repoints CLI.
15. ~~**Rewrite residual core tests**~~ ✅ Only one block needed rewriting: the cycle/origin test in `packages/core/src/ir/context.test.ts` now builds `Resource[]` by hand and calls `IRContext.fromResources()`. Other surviving tests (`milestone.test.ts`, `types.test.ts`, utility tests) are pure IR and required no changes.
16. ~~**Verify core in isolation**~~ ✅ `tsc --noEmit` clean; `yarn workspace @sirenpm/core test` → **7 files / 58 tests passing, 0 failures**; both greps empty in `packages/core/src/`. Residual `web-tree-sitter` mentions remain only in stale `ADAPTER_EXAMPLE.md`, `STATUS.md`, `TREE_SITTER_SETUP.md` (Release 4 docs cleanup).

### Phase 1.5: Release ✅

17. Removed
18. ~~**Merge + publish** — `release-core.yml` publishes `@sirenpm/core@0.2.0` to npm.~~ ✅ Published by user.

**Release 1 exit criteria:** `@sirenpm/core@0.2.0` on npm; core tests pass with no parser/decoder/export code remaining; staging doc enumerates every piece of working code awaiting re-introduction in later releases.

---

## Release 2 — `@sirenpm/language` (target: v0.1.0)

New package consuming the freshly-published `@sirenpm/core@^0.2.0` from npm.

### Phase 2.1: Package scaffold ✅

19. ~~**Create `packages/language/`**~~ ✅ Scaffolded `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, and a placeholder `src/index.ts`. Root workspaces glob already matches `packages/*` — no change needed. `@sirenpm/core@^0.2.0` is declared as a **peer dependency** (consumers supply core) with a matching `devDependencies` entry so local `tsc`/build can resolve it. `web-tree-sitter@0.26.3` (exact pin) is a runtime dependency — language owns the engine version. `--passWithNoTests` added to the vitest script as a temporary accommodation; Phase 2.4 will drop it once tests arrive.

    **Verification:** `yarn install` clean; lockfile confirms `@sirenpm/core@npm:0.2.0` resolves from registry (not workspace); `tsc --noEmit` pass; `tsup build` emits `dist/index.js` + `dist/index.d.ts`; `grep workspace:` in `packages/language/package.json` empty.

### Phase 2.2: Port grammar + parser (consume staging doc) ✅

20. ~~**Move grammar (flatten)**~~ ✅ Grammar moved to `packages/language/grammar/` via `git mv`. Nested `grammar/package.json` deleted. Scripts `grammar:generate`, `grammar:build-wasm`, `grammar:test` folded into `packages/language/package.json` with `tree-sitter-cli@^0.23.2` as a devDependency. `files` glob already includes `grammar/tree-sitter-siren.wasm`.
21. ~~**Port parser source**~~ ✅ Four files (`adapter.ts`, `cst.ts`, `source-index.ts`, `index.ts`) restored from `git show 8e2db1d:...`. Imports of `Origin` (and related IR types) rewritten from `../ir/types` to `@sirenpm/core`. `index.ts` swapped `createParserFactory` re-export for `createParser`.
22. ~~**Rewrite `factory.ts`**~~ ✅ Zero-config `createParser()` written from scratch. All DI plumbing (`ParserFactoryInit`, `ParserLike`, `LanguageLike`, `loadWasm`, `wasmPath`) purged. Uses `new URL('../grammar/tree-sitter-siren.wasm', import.meta.url)` resolved against the emitted `dist/index.js` (depth of one — tsup bundles flatten the source tree, so the plan's `../../../` estimate was wrong). `Parser.init()` cached module-level; one fresh `Parser` instance per call. `packages/language/tsconfig.json` `types` set to `["node"]` so `node:url` + global `URL` resolve. Smoke-tested end-to-end: `task foo {}\nmilestone m { depends_on = [foo] }` → 2 resources, 0 errors. Public surface: `createParser`, all parser/CST types, `Origin`. `dist/index.js` = 21.85 KB, `dist/index.d.ts` = 10.01 KB. Build + `tsc --noEmit` clean.

    **Known wrinkle**: `parser.parse` is called via `as unknown as { parse(s: string): unknown }` because the `web-tree-sitter` typing is stricter than the permissive `NodeLike` conversion code expects. Clean-up candidate for Phase 2.3 when the decoder lands.

### Phase 2.2a: Grammar artifact drift guard + rationale doc ✅

Goal: keep `tree-sitter-siren.wasm` committed (contributor accessibility — no emscripten toolchain needed for `yarn install && yarn test`; no publish-time toolchain dependency; matches ecosystem convention for tree-sitter grammars) while preventing stale-artifact drift via a cheap CI check.

22a. ~~**Create `packages/language/grammar/README.md`**~~ ✅ ~45-line rationale doc covering why the WASM is committed, local regen commands, drift semantics, and the contributor expectation that grammar + WASM ship in the same PR.
22b. ~~**Add `grammar-drift` job to `.github/workflows/ci.yml`**~~ ✅ Third job alongside `test`/`lint`. Uses `fetch-depth: 0`, no Node/yarn install, compares `git log -1 --format=%ct` for `grammar.js` vs. `tree-sitter-siren.wasm`. Fails with an actionable `::error::` annotation when grammar is newer. Verified: YAML parses clean; pure-bash logic test passes both directions; logic against old committed paths (`packages/core/grammar/*`) passes correctly.

    **Caveat:** At current HEAD the Phase 2.2 rename is staged but not yet committed, so `git log -1 -- packages/language/grammar/*` returns empty and the job triggers its "could not determine timestamp" branch. Once the phase is committed, both files share the rename commit's timestamp (equal, not greater) and the job passes. Normal flow from then on.

### Phase 2.2b: CLI test xfail (unblock progress)

After Phase 2.2 the CLI test suite breaks: 6 of 7 test files fail because (a) the CLI is still pinned to `@sirenpm/core@0.1.0` (which has the old `createParserFactory`), and (b) it hardcodes the WASM path at `packages/core/grammar/tree-sitter-siren.wasm` — that file moved to `packages/language/grammar/` in Phase 2.2. This is the blast radius the plan anticipated when it said CLI stays on the old core until Release 3.

**Action taken:** added an `exclude` list to [apps/cli/vitest.config.ts](apps/cli/vitest.config.ts) covering the six parse-dependent CLI tests, with an inline XFAIL comment pointing at this plan section. The remaining green file is `format-diagnostics.test.ts` (pure formatting, no parsing). 13 tests pass.

**Excluded files** (must be re-enabled in Phase 3.3 step 41):
- `src/adapter/node-parser-adapter.test.ts` — the adapter is deleted entirely in Phase 3.2.
- `src/format.cli-mvp.test.ts`, `src/format.unit.test.ts` — depend on real parsing.
- `src/index.test.ts`, `src/project.test.ts` — full CLI integration via `loadProject`.
- `test/golden.test.ts` — golden-file regression suite.

This entry exists so Phase 3.3 has a checklist of what to restore. Do not silently delete the exclude list when migrating; remove entries as each test file is updated.

### Phase 2.3: Port decoder + exporters (consume staging doc) ✅

23. ~~**Port decoder**~~ ✅ Restored `decoder/index.ts` + `xfail.ts` from `fcd99bc` (= `a71ae25^`). Six diagnostic-code string-literal sites renamed (`W001→WL001`, `W002→WL002`, `W003→WL003`, `E001→EL001`); doc-comment `code:` annotation updated. IR-type imports → `@sirenpm/core`; CST imports stay relative. `ParseDiagnostic` defined and exported from `packages/language/src/decoder/index.ts` — not imported from or re-exported by core (per plan decision: structurally satisfies `DiagnosticBase` but lives in language).
24. ~~**Port export logic**~~ ✅ Restored `siren-exporter.ts`, `comment-exporter.ts`, `formatters.ts`, `index.ts` to `packages/language/src/export/`. Added `class SirenExporter implements IRExporter` that wraps the original `exportToSiren` function (both kept on the public surface — class for the IR contract, function for ergonomic use). All `@sirenpm/core` imports collapsed and tightened.
25. ~~**Create `createIRContextFromCst()` bridge**~~ ✅ New `packages/language/src/context-factory.ts` exporting `createIRContextFromCst(cst, source?) → { context, parseDiagnostics: readonly ParseDiagnostic[] }`. Single-document signature matches the original `IRContext.fromCst()` shape. Failed decodes still yield a valid empty `IRContext` (uses `document?.resources ?? []`).
26. ~~**Create public API**~~ ✅ Re-exports added: decoder (`decode`, `decodeDocument`, `DecodeResult`, `ParseDiagnostic`); exporters (`exportToSiren`, `exportWithComments`, `SirenExporter`, `formatAttributeLine`, `formatAttributeValue`, `formatPrimitive`, `wrapResourceBlock`); bridge (`createIRContextFromCst`, `CreateIRContextResult`).

**Verification:** `tsc --noEmit` clean; `tsup build` emits `dist/index.js` ~33.5 KB (up from 22 KB). Full-pipeline smoke (parse → bridge → export) round-trips a 2-resource source with zero diagnostics. Diagnostic-code smoke: `task t complete { complete = false }` emits exactly one `WL001` (no `W*`/`E*` literals remain in `packages/language/src/decoder/`).

**Wrinkle deferred:** The `parser.parse` cast in `factory.ts` is unrelated to decoder concerns (bridges `web-tree-sitter`'s `Tree | null` to the permissive `NodeLike` shape). Out of scope; no-op.

### Phase 2.4: Port tests + fixtures (consume staging doc) ✅

27. ~~**Move helpers**~~ ✅ Restored a single thin helper at `packages/language/test/helpers/parser.ts` (memoizes a `createParser()` instance plus a `doc()` convenience). The legacy `node-adapter.ts` (~520 lines of CST-conversion logic) was **deleted**, not ported — `createParser()` already returns a fully-baked `ParserAdapter`, so the old test-only adapter would have duplicated production code.
28. ~~**Move fixtures**~~ ✅ 8 snippet fixtures `git mv`'d to `packages/language/test/fixtures/snippets/`. The 34 deferred project fixtures were **copied** (not symlinked) to `packages/language/test/fixtures/projects/`; originals stay put under `packages/core/test/fixtures/projects/` until Phase 3.3 repoints CLI's `fixture-utils.ts`.
29. ~~**Move integration + unit tests**~~ ✅ All restored: `integration/node-adapter.test.ts`, `integration/fixtures.test.ts`, `integration/decode-fixtures.test.ts`, all 28 `integration/projects/*.test.ts` plus `helper.ts`. The legacy `factory.test.ts` was dropped (it targeted the deleted `createParserFactory` DI surface; equivalent smoke coverage is provided by `node-adapter.test.ts`). Diagnostic-code assertions updated for `WL001`/`WL002`/`WL003`/`EL001` and core `W001`/`W002`/`W003`. Imports rewritten to source IR/`Origin`/`DependencyTree` from `@sirenpm/core` and parser/decoder/export/`createIRContextFromCst` from local `../../src/...`.

**Incidental fix:** `packages/language/src/parser/factory.ts` `resolveGrammarWasmPath()` was Phase-2.2 only correct for the bundled `dist/index.js`. Updated to try both bundle-relative and source-relative URLs so vitest can run against raw `src/`.

**Verification:**
- `yarn workspace @sirenpm/language tsc --noEmit` clean.
- `yarn workspace @sirenpm/language test` → **31 files / 101 tests passing**.
- `yarn workspace @sirenpm/core test` → **7 files / 58 tests passing** (untouched).
- `yarn workspace @sirenpm/cli test` → 1 file / 13 tests passing (Phase 2.2b xfail baseline preserved).
- `grep "IRContext\.fromCst" packages/language/src/` → only stale JSDoc comments (no call sites). Cleanup in Phase 2.5/Release 4 docs pass.
- `grep -E "from ['\"](\\.\\./)+ir/" packages/language/src/` → empty.
- `staging/language-tests/` removed.

### Phase 2.5: Verify + release

30. **Verify:**
    - `yarn workspace @sirenpm/language tsc --noEmit`
    - `yarn workspace @sirenpm/language test`
    - `grep -r "@sirenpm/language" packages/core/src/` → empty (no reverse dep).
    - Language resolves `@sirenpm/core` from npm, not workspace.
    - **WASM packaging check**: `npm pack --dry-run` (or `yarn pack`) inside `packages/language/` lists `grammar/tree-sitter-siren.wasm` in the tarball contents.
31. **Add CI release workflow** — `.github/workflows/release-language.yml` mirroring `release-core.yml`.
32. **Changeset + publish** — `@sirenpm/language@0.1.0` via CI.
33. **Update staging doc** — Tick off the "Release 2 port targets" section, leaving "Release 3 port targets" intact.

**Release 2 exit criteria:** `@sirenpm/language@0.1.0` on npm; parse/decode/export tests pass inside the language package; staging doc reflects completion.

---

## Release 3 — `@sirenpm/cli` migration

### Phase 3.1: Record + swap dependencies

34. **Confirm staging doc** — The "Release 3 port targets" section was authored during Release 1 Phase 1.3 step 8. Re-read it; if any CLI surface has shifted since then, append updates before proceeding.
35. **Update `apps/cli/package.json`** — bump `"@sirenpm/core": "^0.2.0"`, add `"@sirenpm/language": "^0.1.0"`, remove `"web-tree-sitter"` (now transitive via language). `yarn install`.

### Phase 3.2: Code updates

36. **Delete `apps/cli/src/adapter/node-parser-adapter.ts`** — the CLI calls `createParser()` from `@sirenpm/language` (zero-config).
37. **Update CLI imports** — `apps/cli/src/parser.ts`, `apps/cli/src/project.ts`, `apps/cli/src/commands/format.ts`: switch parser/export/bridge imports to `@sirenpm/language`; keep IR/diagnostic imports from `@sirenpm/core`; replace `IRContext.fromCst()` with `createIRContextFromCst()`; combine returned `parseDiagnostics` with `ir.diagnostics`.
38. **Update diagnostic formatting** — `apps/cli/src/format-diagnostics.ts` uses new code literals (WL001–WL003, EL001, core W001–W003). Preserve WL003's `secondLine`/`secondColumn` special case in `formatPrefix()`.
39. **Update `ParseError` import source** — `apps/cli/src/format-parse-error.ts` now imports from `@sirenpm/language`.

### Phase 3.3: Test updates

40. **Refresh CLI test infrastructure** — Refresh or delete `apps/cli/src/adapter/node-parser-adapter.test.ts` (likely delete since the adapter is gone) and `apps/cli/test/helpers/test-utils.ts`.
41. **Regenerate golden files** — Every `apps/cli/test/expected/*.txt` touching diagnostics is updated for WL001–WL003, EL001, and core W001–W003. NOTE - refer to xfail override from Phase 2.2b. This step should remove the xfail override and rectify the failures.
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
