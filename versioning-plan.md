# Plan: Per-Package Versions with Git SHA Prerelease Tag

## TL;DR
Each package (`@siren/core`, `@siren/cli`) gets its own `version` constant. At build time, a `BUILD_METADATA` macro (resolved via git tag detection: tagged HEAD = release, untagged = prerelease with short SHA) is injected using esbuild/vite `define`. The CLI's `--version` prints two lines. Tests see an empty `BUILD_METADATA` so golden files stay valid.

---

## Phase 1 — Core: `buildMetadata` export

**Step 1.** Create `packages/core/src/build-metadata.ts`:
- Export `export const buildMetadata: string = (import.meta.env as { BUILD_METADATA?: string }).BUILD_METADATA ?? '';`

**Step 2.** Export `buildMetadata` from `packages/core/src/index.ts`.

**Step 3.** Add `define` to `packages/core/vitest.config.ts`:
- `'import.meta.env.BUILD_METADATA': '""'`

**Step 4.** Add TypeScript env declarations for `BUILD_METADATA` to `packages/core/src/` (a `env.d.ts` extending `ImportMeta`).

---

## Phase 2 — CLI: Own version constant

**Step 5.** Create `apps/cli/src/version.ts`:
- `export const cliVersion = '0.1.0';`

---

## Phase 3 — CLI tsup config: git tag detection

**Step 6.** Update `apps/cli/tsup.config.ts`:
- Import `execSync` from `child_process`
- Add `getBuildMetadata()` helper: `git rev-parse --short HEAD` → sha; `git tag --points-at HEAD` → if any tags, empty string (release), else sha (prerelease)
- Add to tsup config: `define: { 'import.meta.env.BUILD_METADATA': JSON.stringify(getBuildMetadata()) }`

---

## Phase 4 — CLI vitest config

**Step 7.** Add `define: { 'import.meta.env.BUILD_METADATA': '""' }` to `apps/cli/vitest.config.ts`.
- Also add TypeScript env declarations for CLI: `apps/cli/src/env.d.ts` (same ImportMeta extension).

---

## Phase 5 — CLI `--version` handler

**Step 8.** Update `apps/cli/src/index.ts`:
- Import `cliVersion` from `./version.ts` (new)
- Import `version as coreVersion, buildMetadata` from `@siren/core`
- Derive full versions: `const suffix = buildMetadata ? '-' + buildMetadata : '';`
- Update `--version` handler to print two lines:
  ```
  Siren CLI v{cliVersion}{suffix}
  Siren Core v{coreVersion}{suffix}
  ```
- Update `printUsage()` to use `cliVersion + suffix` instead of bare `version` from core

---

## Phase 6 — Golden tests

**Step 9.** Add `apps/cli/test/expected/version.out.txt`:
- Metadata: `{"fixture": "empty-files", "command": "siren --version"}`
- stdout: two lines `Siren CLI v0.1.0` / `Siren Core v0.1.0` (in test mode sha is empty)

**Step 10.** Add `--version` test case to `apps/cli/test/golden.test.ts`.

---

## Phase 7 — Web app (separate, lower priority)

**Step 11.** Create `apps/web/vite.config.ts` with same `getBuildMetadata()` logic + `define`.
- Update `apps/web/src/main.ts` to use `buildMetadata` from core when displaying version.

---

## Relevant files
- `packages/core/src/index.ts` — add `buildMetadata` re-export
- NEW `packages/core/src/build-metadata.ts` — the `buildMetadata` constant using macro
- NEW `packages/core/src/env.d.ts` — TypeScript ImportMeta extension
- `packages/core/vitest.config.ts` — add `define`
- NEW `apps/cli/src/version.ts` — CLI's own semver constant
- NEW `apps/cli/src/env.d.ts` — TypeScript ImportMeta extension
- `apps/cli/src/index.ts` — update `--version` handler and `printUsage()`
- `apps/cli/tsup.config.ts` — add git detection + `define`
- `apps/cli/vitest.config.ts` — add `define` with empty string
- NEW `apps/cli/test/expected/version.out.txt` — golden file
- `apps/cli/test/golden.test.ts` — add test case
- (Optional) NEW `apps/web/vite.config.ts` — web app build metadata

---

## Verification
1. `yarn workspace @siren/cli test` — all golden tests pass (empty sha in test mode)
2. `yarn workspace @siren/core test` — tests pass with import.meta.env.BUILD_METADATA defined
3. `yarn workspace @siren/cli build` — builds without errors; `node dist/index.js --version` shows two lines with sha (if untagged HEAD)
4. Simulate release: create a git tag on HEAD, rebuild; `node dist/index.js --version` shows two lines WITHOUT sha
5. TypeScript: `yarn workspace @siren/cli tsc --noEmit` passes with new env.d.ts declarations

---

## Decisions
- Build metadata = git commit short SHA for untagged HEAD, empty string for tagged HEAD
- `buildMetadata` lives in core and is exported (consistent with "maximum core" principle)
- `--version` prints both CLI and Core versions on separate lines
- Test environments always use empty `BUILD_METADATA` so golden files remain stable
- Web app versioning is included but as a lower-priority step (step 11)
- CLI's `printUsage()` also updated to use full version (sha visible when built as prerelease)
