/**
 * CLI parser entrypoint.
 *
 * The CLI now delegates parsing to `@sirenpm/core`'s parser factory and only
 * provides Node runtime wiring in `adapter/node-parser-adapter.ts`.
 */

import type { ParserAdapter } from '@sirenpm/core';
import { getNodeParser } from './adapter/node-parser-adapter.js';

export async function getParser(): Promise<ParserAdapter> {
  return getNodeParser();
}
