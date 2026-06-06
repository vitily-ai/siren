/**
 * Bridge: decode syntax documents into a SirenProject while surfacing parse-phase
 * diagnostics separately. Semantic diagnostics ride on the returned
 * SirenProject; grammar/parse-time diagnostics are returned alongside.
 */

import { SirenBuilder, type SirenProject } from '@sirenpm/core';
import { decodeSyntaxDocuments, type ParseDiagnostic } from './decoder/index';
import type { ParseError, ParseResult } from './parser/adapter';
import type { SyntaxDocument } from './syntax/types';

export interface CreateSirenProjectResult {
  readonly context: SirenProject;
  readonly parseDiagnostics: readonly ParseDiagnostic[];
}

/**
 * Decode parsed syntax documents into a fully resolved SirenProject.
 *
 * @param syntaxDocuments - Parsed document model values from parser output
 */
export function createSirenProjectFromSyntaxDocuments(
  syntaxDocuments: readonly SyntaxDocument[],
): CreateSirenProjectResult {
  const { documents, diagnostics: parseDiagnostics } = decodeSyntaxDocuments(syntaxDocuments);
  const context = SirenBuilder.fromDocuments(documents ?? []).build();
  return { context, parseDiagnostics };
}

function toDiagnosticColumn(column: number | undefined): number | undefined {
  if (column === undefined) return undefined;
  return Math.max(0, column - 1);
}

function parseErrorsToDiagnostics(errors: readonly ParseError[]): readonly ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];

  for (const error of errors) {
    if ((error.severity ?? 'error') === 'error') {
      diagnostics.push({
        code: 'EL001',
        message: `Invalid syntax: ${error.message}`,
        severity: 'error',
        file: error.document,
        line: error.line,
        column: toDiagnosticColumn(error.column),
      });
    }
  }

  return diagnostics;
}

/**
 * Decode parser output into an IRContext using `ParseResult.syntaxDocuments`.
 */
export function createSirenProjectFromParseResult(
  parseResult: ParseResult,
): CreateSirenProjectResult {
  const syntaxDocuments = parseResult.syntaxDocuments ?? [];
  const result = createSirenProjectFromSyntaxDocuments(syntaxDocuments);
  const parserDiagnostics = parseErrorsToDiagnostics(parseResult.errors);
  const lintDiagnostics = parseResult.parseDiagnostics ?? [];

  return {
    context: result.context,
    parseDiagnostics: [...parserDiagnostics, ...lintDiagnostics, ...result.parseDiagnostics],
  };
}
