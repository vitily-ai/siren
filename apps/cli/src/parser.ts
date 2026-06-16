/**
 * CLI parser entrypoint.
 */

import { createParser, type Parser } from '@sirenpm/language';

export async function getParser(): Promise<Parser> {
  return createParser();
}
