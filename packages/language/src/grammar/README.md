# Siren grammar

This directory contains the tree-sitter grammar for the Siren language and its
compiled WebAssembly artifact (`tree-sitter-siren.wasm`).

## Why the WASM is committed

- **Contributor accessibility.** `yarn install && yarn test` must work on a
  stock Node 24 + Yarn 4 setup. Regenerating the WASM requires either an
  emscripten toolchain (~200 MB, multi-minute install) or Docker. Committing
  the artifact keeps the common path friction-free.
- **Publish reliability.** The npm tarball for `@sirenpm/language` ships
  `grammar/tree-sitter-siren.wasm` directly. Regenerating at publish time
  would make every release dependent on emscripten being healthy in CI.
- **Ecosystem convention.** Published tree-sitter grammars
  (`tree-sitter-typescript`, `-python`, `-rust`, …) all commit their WASM.

## Regenerating locally

Run these after editing `grammar.js`:

```bash
yarn workspace @sirenpm/language grammar:generate
yarn workspace @sirenpm/language grammar:build-wasm
```

`grammar:build-wasm` requires either `emscripten` or Docker; `tree-sitter-cli`
will prompt for the backend. See the
[tree-sitter CLI docs](https://tree-sitter.github.io/tree-sitter/creating-parsers)
for setup.

## Drift detection

CI runs a `grammar-drift` job on every push and pull request. It compares the
last-commit timestamp of `grammar.js` against `tree-sitter-siren.wasm`:

```bash
git log -1 --format=%ct -- grammar.js
git log -1 --format=%ct -- tree-sitter-siren.wasm
```

If `grammar.js` is newer than the WASM, the job fails with an actionable
error.

**Contributor expectation:** any change to `grammar.js` must include a
regenerated `tree-sitter-siren.wasm` in the same PR. Do not split grammar
source changes and regenerated artifacts across PRs.
