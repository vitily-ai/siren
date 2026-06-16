---
name: tree-sitter tooling and testing
description: Explains how to properly use the tree-sitter-cli in the project, and interact with the grammar via scripts and tests.
license: Complete terms in LICENSE.txt
---

You must be in the `/packages/language/src/grammar` directory. You will have access to `tree-sitter-cli` from there via `yarn run tree-sitter`, with which you can run the various relevant tree-sitter commands, including:
* `yarn generate`
* `yarn build`
* `yarn run tree-sitter parse <file>`
* `yarn test`

For scripted runs from the repo root, prefer the language package scripts:
* `yarn workspace @sirenpm/grammar generate`
* `yarn workspace @sirenpm/grammar build`
* `yarn workspace @sirenpm/grammar test`