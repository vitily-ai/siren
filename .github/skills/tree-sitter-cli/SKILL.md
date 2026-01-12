---
name: tree-sitter tooling and testing
description: Explains how to properly use the tree-sitter-cli in the project, and interact with the grammar via scripts and tests.
license: Complete terms in LICENSE.txt
---

You must be in the `/packages/core/grammar` directory. You will have access to `tree-sitter-cli` from there via `npx tree-sitter-cli`, with which you can run the various relevant tree sitter commands, including:
* `npx tree-sitter-cli generate`
* `npx tree-sitter-cli build --wasm`
* `npx tree-sitter-cli parse <file>`
* `npx tree-sitter-cli tets`

Additionally, running the grammar tests should be done via `yarn vitest run --dir packages/core`, assuming a cwd of project root.