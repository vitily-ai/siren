import type { ParseError } from '@siren/core';

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function formatParseError(err: ParseError, source: string): string {
  const severity = err.severity ?? 'error';
  const document = err.document ?? 'unknown';

  const lineNumber = err.line;
  const columnNumber = err.column;

  const lines = source.split(/\r?\n/u);
  const lineText = lines[lineNumber - 1] ?? '';

  const caretColumn = clamp(columnNumber, 1, lineText.length + 1);
  const remainingOnLine = Math.max(1, lineText.length - (caretColumn - 1));
  const desiredUnderline = err.found && err.found.length > 0 ? err.found.length : 1;
  const underlineLength = clamp(desiredUnderline, 1, remainingOnLine);

  const lineNo = String(lineNumber);
  const gutter = ' '.repeat(lineNo.length);
  const caretSpaces = ' '.repeat(Math.max(0, caretColumn - 1));
  const carets = '^'.repeat(underlineLength);

  return [
    `${severity}: ${err.message}`,
    ` --> ${document}:${lineNumber}:${columnNumber}`,
    `  |`,
    `${lineNo} | ${lineText}`,
    `${gutter} | ${caretSpaces}${carets}`,
  ].join('\n');
}
