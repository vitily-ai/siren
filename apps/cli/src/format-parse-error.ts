import type { EL001Diagnostic } from '@sirenpm/language';

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Byte offset of the start of `row` (0-based) within `source`. */
function rowStartByte(source: string, row: number): number {
  let index = 0;
  for (let line = 0; line < row; line++) {
    const next = source.indexOf('\n', index);
    if (next === -1) return index;
    index = next + 1;
  }
  return index;
}

/**
 * Render an `EL001` syntax-error diagnostic as a caret snippet.
 *
 * EL001 reports a resource excluded from the AST. When the diagnostic carries a
 * range `origin`, we reconstruct the offending line and underline the span;
 * otherwise we fall back to a positionless message.
 */
export function formatSyntaxError(diagnostic: EL001Diagnostic, source: string): string {
  const document = diagnostic.documentName ?? 'unknown';
  const subject = diagnostic.resourceId ? ` '${diagnostic.resourceId}'` : '';
  const message = `could not parse ${diagnostic.nodeType}${subject}`;

  const origin = diagnostic.origin;
  if (!origin || origin.kind !== 'range') {
    return [`error: ${message}`, ` --> ${document}`].join('\n');
  }

  const lines = source.split(/\r?\n/u);
  const lineNumber = origin.startRow + 1;
  const lineText = lines[origin.startRow] ?? '';

  const lineStart = rowStartByte(source, origin.startRow);
  const columnNumber = clamp(origin.startByte - lineStart + 1, 1, lineText.length + 1);
  const remainingOnLine = Math.max(1, lineText.length - (columnNumber - 1));
  const spanLength = Math.max(1, origin.endByte - origin.startByte);
  const underlineLength = clamp(spanLength, 1, remainingOnLine);

  const lineNo = String(lineNumber);
  const gutter = ' '.repeat(lineNo.length);
  const caretSpaces = ' '.repeat(Math.max(0, columnNumber - 1));
  const carets = '^'.repeat(underlineLength);

  return [
    `error: ${message}`,
    ` --> ${document}:${lineNumber}:${columnNumber}`,
    `  |`,
    `${lineNo} | ${lineText}`,
    `${gutter} | ${caretSpaces}${carets}`,
  ].join('\n');
}

