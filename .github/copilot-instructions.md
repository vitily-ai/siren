# Siren - Copilot Instructions

## Project Overview
Siren is a "Project Management as Code" (PMaC) framework for defining projects as discrete atomic milestones using an HCL-inspired grammar. Text-based project definitions live alongside code in version control.

## Grammar (HCL-inspired)
```siren
# Two resource types: task and milestone
task my-task {
    description = "A task with attributes"
    depends_on = other-task          # single reference
}

milestone release-1 {
    description = "Groups tasks into deliverables"
    depends_on = [task-a, task-b]    # array of references
}
```

**Values**: strings (`"..."`), numbers, booleans (`true`/`false`), `null`, references (bare identifiers), arrays (`[a, b]`).  
**Identifiers**: bare (`my_task`, `cli-mvp`) or quoted (`"has spaces"`).  
**Comments**: `#` or `//` style.  
**Error-tolerant**: Parser recovers from incomplete input (e.g., missing `}`).

## Architecture
- **Core library** (`packages/core`, `@sirenpm/core`): Environment-agnostic TypeScript — IR types, `IRContext`, semantic validation, `DiagnosticBase`, `IRExporter` interface, and shared utilities. No parser/decoder/export code, no DOM, no Node APIs. Bundled with tsup into a single ESM module + `.d.ts`.
- **Language package** (`packages/language`, `@sirenpm/language`): Owns the tree-sitter grammar (WASM), parser factory (`createParser()`), CST types, decoder (CST → IR), comment classification, exporters (`SirenExporter`, `exportToSiren`, `exportWithComments`), and formatters. `web-tree-sitter` is a direct runtime dep; WASM resolution is package-relative. Depends on `@sirenpm/core` (peer).
- **CLI** (`apps/cli`, `@sirenpm/cli`): Node CLI built with tsup/esbuild. Consumes `@sirenpm/core` + `@sirenpm/language` via npm pins. No `web-tree-sitter` dep — transitive via language.
- **Web app** (`apps/web`): Vite-based browser app. Currently consumes `@sirenpm/core` via workspace linkage; will add `@sirenpm/language` when in-browser parsing lands.
- **IR Layer**: Resources decode into a shared intermediate representation that supports multiple backends.

## Monorepo Structure
```
packages/
  core/         # IR, semantic validation, DiagnosticBase, IRExporter, utilities (env-agnostic)
    src/
      ir/        # types, IRContext, semantic diagnostics, DiagnosticBase, IRExporter
      utilities/ # graph, dependency-tree, milestone, entry helpers
  language/     # grammar, parser factory, decoder, exporters, formatters
    grammar/    # tree-sitter grammar + committed tree-sitter-siren.wasm
    src/
      parser/   # createParser(), CST types, source-index, adapter interface
      decoder/  # CST → IR, parse diagnostics (WL/EL codes)
      export/   # SirenExporter, exportToSiren, exportWithComments, formatters
apps/
  web/          # Vite browser app
  cli/          # Node CLI (tsup/esbuild)
```

## Runtime & Tooling
- **Node.js 24** + **Yarn 4** (Berry) with workspaces
- **TypeScript** throughout the monorepo
- Use `yarn workspace <name> <cmd>` for package-specific commands
- Root `package.json` orchestrates cross-package scripts

## Key Development Rules
1. **Core stays portable**: No DOM or Node APIs in `packages/core` — must run in both environments. "Portable" means environment-agnostic code, not unbundled distribution.
2. **Core is bundled**: `packages/core` builds to a single bundled ESM module + `.d.ts` via tsup.
3. **Strict layering**: `@sirenpm/core` must not import from `@sirenpm/language`. Parser, decoder, and export logic belong in language, not core.
4. **Registry resolution by default**: Published packages depend on each other via the npm registry (not `workspace:*`). `@sirenpm/cli` pins `@sirenpm/core` and `@sirenpm/language`; `@sirenpm/language` pins `@sirenpm/core`. `enableTransparentWorkspaces: false` in `.yarnrc.yml` enforces this. To iterate locally, link manually (`yarn link`) or temporarily swap to `workspace:*`. The web app (`apps/web`) uses `workspace:*` because it is not published.
5. **Diagnostic codes**: Core owns semantic codes `W001` (circular), `W002` (dangling), `W003` (duplicate id). Language owns parse-phase codes `WL001`–`WL003` and `EL001`. `DiagnosticBase` carries no `message` — frontends assemble display text from structured fields.
6. **Zero-config parser**: `createParser()` in `@sirenpm/language` owns `web-tree-sitter` initialization and resolves the grammar WASM via `new URL(...)` package-relative — consumers do not configure paths.
7. **Maximum core**: Core contains high-level utility logic (e.g. listing milestones) in addition to IR types and validation. A utility useful for one frontend is likely useful for others.

## Testing
- **Vitest** repo-wide for unit tests
- Per-package environments: `node` for core/CLI, `jsdom` for web
- **Playwright** only for browser E2E tests requiring real WASM loading

### Testing guidelines for code changes
- **Grammar/parser changes**: Any change to `packages/language` that affects parsing should include an associated `snippets` fixture under `packages/language/test/fixtures/snippets/` demonstrating the grammar case being modified or added.
- **Decoder/IR changes**: Changes that affect CST → IR decoding or the intermediate representation must include a corresponding `projects` fixture under `packages/language/test/fixtures/projects/` (and, when the change is purely semantic in core, exercise the IR via core unit tests).
- **CLI changes**: Any change to the CLI behavior (commands, output formatting, warnings ordering) should include a golden-file test under `apps/cli/test/expected/` asserting stdout and, where applicable, stderr output. Use the `fixture-utils` helper to copy `projects` fixtures into temporary directories for CLI tests.

These rules make it easier to review behavioral changes and keep parity between `core`, `language`, and `cli` tests.

## Design Principles
- **Error tolerance**: Grammar must be recoverable and composable, not fail on first error
- **JIT rendering**: Changes reflect immediately without separate compilation
- **Self-bootstrapping**: Project defines its own milestones using Siren format
- **LM-agent friendly**: Optimize for context efficiency when used by autonomous agents

## License
GPL-3.0 for open source. Web app as hosted service avoids copyleft; separate commercial license for distributed/embedded enterprise deployments.
