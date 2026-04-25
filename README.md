# Siren

Project Management as Code — define projects as atomic milestones using an HCL-inspired grammar.

## Install the CLI

Run without installing (recommended for now):

```bash
npx @sirenpm/cli --version
```

Global install:

```bash
npm i -g @sirenpm/cli
siren --version
```

## Quick start (contributors)

Install dependencies and run tests:

```bash
yarn install
yarn build
yarn test
```

Run the CLI from source (after build):

```bash
node apps/cli/dist/index.js
```

## Requirements

- Node.js >= 24
- Yarn 4 (Berry) — enable via Corepack

## Project layout

- `packages/core` — IR types, semantic validation, `DiagnosticBase`, `IRExporter` interface, and shared utilities (environment-agnostic; no parser/decoder/export code)
- `packages/language` — tree-sitter grammar, parser factory (`createParser()`), CST → IR decoder, exporters/formatters; depends on `@sirenpm/core`
- `apps/web` — Vite-based browser app **STUB - NOT STARTED**
- `apps/cli` — Node CLI built with `tsup`/`esbuild`; depends on `@sirenpm/core` + `@sirenpm/language` via npm pins

CLI and language consume `@sirenpm/core` from the npm registry (not `workspace:*`); each package ships independently. The web app uses `workspace:*` because it is not published.

## Install & build (dev)

1. Install deps: `yarn install`
2. Build everything: `yarn build`
3. Run package tests: `yarn test`

Use workspace commands for package-scoped tasks, e.g. `yarn workspace @sirenpm/core test`.

### Local CLI install (developer)

To build the CLI and make the `siren` command available globally during development:

```bash
yarn install
yarn workspace @sirenpm/cli build
mkdir -p ~/.local/bin
ln -sf "$(pwd)/apps/cli/dist/index.js" ~/.local/bin/siren
chmod +x ~/.local/bin/siren
# ensure ~/.local/bin is in your PATH (add to shell profile if needed)
```

After this the `siren` command should be callable from any directory, e.g. `siren --version`.

## Developer notes

- Core is environment-agnostic: do not introduce DOM or Node-specific APIs into `packages/core`.
- The parser uses a Tree-sitter grammar (WASM) located in `packages/language/grammar`. The committed `tree-sitter-siren.wasm` ships with the package; CI guards against grammar/WASM drift.
- To iterate on `@sirenpm/core` and a downstream package together locally, link manually (`yarn link`) or temporarily swap the npm-pinned dep to `workspace:*`.
- Tests use Vitest; run per-package tests via `yarn workspace <pkg> test`.

## Contributing

See CONTRIBUTORS.md for repository structure, conventions, and how to run/build/test.