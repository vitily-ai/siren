/**
 * Node.js ParserAdapter implementation using web-tree-sitter
 *
 * Adapted from packages/core/test/helpers/node-adapter.ts
 * This is intentional duplication - CLI owns its runtime adapter.
 */

import type { ParserAdapter } from '@siren/core';
import { getNodeParser } from './adapter/node-parser-adapter.js';

export async function getParser(): Promise<ParserAdapter> {
  return getNodeParser();
}
