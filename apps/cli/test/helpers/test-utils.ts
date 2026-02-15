/**
 * Shared test helpers for CLI tests
 */

import type { SourceDocument } from '@siren/core';

/**
 * Helper to wrap a source string as a single SourceDocument for testing.
 */
export function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}
