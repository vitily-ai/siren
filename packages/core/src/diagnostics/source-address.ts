/**
 * Source address utilities for serializing/parsing attribution strings.
 *
 * The canonical format is "file:line:col" where line is 1-based and col is 0-based.
 * Example: "siren/tasks.siren:5:0"
 */

export interface SourceAddress {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Parse a serialized source address "file:line:col" into structured parts.
 * Returns an empty object if the string is undefined or malformed.
 *
 * Splits from the right so filenames containing colons are handled correctly.
 */
export function parseSourceAddress(source?: string): SourceAddress {
  if (!source) return {};

  const lastColon = source.lastIndexOf(':');
  if (lastColon < 0) return { file: source };

  const secondLastColon = source.lastIndexOf(':', lastColon - 1);
  if (secondLastColon < 0) return { file: source };

  const file = source.slice(0, secondLastColon);
  const line = parseInt(source.slice(secondLastColon + 1, lastColon), 10);
  const column = parseInt(source.slice(lastColon + 1), 10);

  if (Number.isNaN(line) || Number.isNaN(column)) return { file: source };
  return { file: file || undefined, line, column };
}

/**
 * Serialize a source address into the canonical "file:line:col" format.
 * Returns undefined if no meaningful attribution is available.
 */
export function serializeSourceAddress(
  file?: string,
  line?: number,
  column?: number,
): string | undefined {
  if (!file && line === undefined) return undefined;
  const doc = file ?? '';
  if (line === undefined) return doc || undefined;
  return `${doc}:${line}:${column ?? 0}`;
}
