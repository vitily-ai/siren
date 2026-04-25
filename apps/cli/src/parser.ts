/**
 * CLI parser entrypoint.
 */

import { createParser, type ParserAdapter } from '@sirenpm/language';

export async function getParser(): Promise<ParserAdapter> {
  return createParser();
}
