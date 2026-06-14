import type { RangeOrigin } from '@sirenpm/language';

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Byte offset of the start of `row` (0-based) within `source`. */
export function rowStartByte(source: string, row: number): number {
  let index = 0;
  for (let line = 0; line < row; line++) {
    const next = source.indexOf('\n', index);
    if (next === -1) return index;
    index = next + 1;
  }
  return index;
}

/**
 * Render a caret-snippet block for a source range origin.
 *
 * Returns the gutter separator, numbered source line, and underline carets
 * (e.g. `"  |\n1 | text\n  | ^^^"`). Does NOT include the diagnostic header
 * line — callers should produce that separately via `formatDiagnostic()`.
 */
export function renderCaretSnippet(origin: RangeOrigin, source: string): string {
  const isMultiLine = origin.endRow > origin.startRow;
  const snippet = source.slice(origin.startByte, origin.endByte);
  const _trimmedSnippet = snippet.endsWith('\n') ? snippet.slice(0, -1) : snippet;

  const lines = source.split(/\r?\n/u);
  const lineNumber = origin.startRow + 1;
  const lineText = lines[origin.startRow] ?? '';

  const lineStart = rowStartByte(source, origin.startRow);
  const columnNumber = clamp(origin.startByte - lineStart + 1, 1, lineText.length + 1);

  // For single-line spans, underline the exact range.
  // For multi-line spans (resource-level EL001 fallback), underline to end of first line.
  const remainingOnLine = Math.max(1, lineText.length - (columnNumber - 1));
  const spanLength = isMultiLine ? remainingOnLine : Math.max(1, origin.endByte - origin.startByte);
  const underlineLength = clamp(spanLength, 1, remainingOnLine);

  const lineNo = String(lineNumber);
  const gutter = ' '.repeat(lineNo.length);
  const caretSpaces = ' '.repeat(Math.max(0, columnNumber - 1));
  const carets = '^'.repeat(underlineLength);

  const parts = [`  |`, `${lineNo} | ${lineText}`, `${gutter} | ${caretSpaces}${carets}`];

  // For multi-line spans, add a note.
  if (isMultiLine) {
    parts.push(
      `${gutter} | ${' '.repeat(lineText.length)}`,
      `${gutter} = note: the parse error is inside this block`,
    );
  }

  return parts.join('\n');
}
