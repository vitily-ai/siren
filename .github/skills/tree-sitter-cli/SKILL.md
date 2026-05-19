---
name: tree-sitter tooling and testing
description: Explains how to properly use the tree-sitter-cli in the project, and interact with the grammar via scripts and tests.
license: Complete terms in LICENSE.txt
---

Use the `@sirenpm/grammar` workspace, which pins `tree-sitter-cli`, for the relevant tree-sitter commands:
* `yarn workspace @sirenpm/grammar generate`
* `yarn workspace @sirenpm/grammar build-wasm`
* `yarn workspace @sirenpm/grammar tree-sitter parse <file>`
* `yarn workspace @sirenpm/grammar test`

For direct debugging inside `packages/language/grammar`, use the package scripts:
* `yarn generate`
* `yarn build-wasm`
* `yarn test`