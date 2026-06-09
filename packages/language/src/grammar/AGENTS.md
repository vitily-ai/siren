# Siren Grammar

* `tree-sitter` cli is intended to be invoked through this package's `package.json` scripts, which requires installing dev dependencies first
* if a `tree-sitter` cli command is not represented by an existing script, use `yarn run tree-sitter <command>`
* Generated sources are intentionally committed to prevent CI and contributors requiring an `emscripten` dependency