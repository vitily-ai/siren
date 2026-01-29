/**
 * Node.js ParserAdapter implementation using web-tree-sitter
 *
 * Adapted from packages/core/test/helpers/node-adapter.ts
 * This is intentional duplication - CLI owns its runtime adapter.
 *
 * TODO: This file should be updated once the `Parser Interface` task in
 * `siren/extras.siren` is implemented in `@siren/core`. That task defines a
 * parser factory which accepts a WASM-loader/injector. At that time the CLI
 * should delegate parsing to `@siren/core`'s injected parser factory and only
 * provide the Node `loadWasm()` implementation (see task `node-loader-package`).
 * (Task: `project-loader-interface` / `node-loader-package`)
 */

import type { ParserAdapter } from '@siren/core';
import { getNodeParser } from './adapter/node-parser-adapter.js';

export async function getParser(): Promise<ParserAdapter> {
  return getNodeParser();
}
