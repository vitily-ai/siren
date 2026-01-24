# Siren

Project Management as Code — define projects as atomic milestones using an HCL-inspired grammar.

## Quick start

Install dependencies and run tests:

```bash
yarn install
yarn build
yarn test
```

Run the CLI (after build):

```bash
node apps/cli/dist/index.js
```

## Requirements

- Node.js >= 24
- Yarn 4 (Berry) — enable via Corepack

## Project layout

- `packages/core` — parsing, decoding, IR, utilities (environment-agnostic)
- `apps/web` — Vite-based browser app (WASM + Mermaid integration) **STUB - NOT STARTED**
- `apps/cli` — Node CLI built with `tsup`/`esbuild`

## Install & build (dev)

1. Install deps: `yarn install`
2. Build everything: `yarn build`
3. Run package tests: `yarn test`

Use workspace commands for package-scoped tasks, e.g. `yarn workspace @siren/core test`.

## Developer notes

- Core is environment-agnostic: do not introduce DOM or Node-specific APIs into `packages/core`.
- The parser uses a Tree-sitter grammar (WASM) located in `packages/core/grammar`.
- Tests use Vitest; run per-package tests via `yarn workspace <pkg> test`.

## Contributing

See CONTRIBUTORS.md for repository structure, conventions, and how to run/build/test.