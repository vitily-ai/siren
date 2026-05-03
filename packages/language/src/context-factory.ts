/**
 * Bridge: decode syntax documents into an IRContext while surfacing parse-phase
 * diagnostics separately. Semantic diagnostics ride on the returned
 * IRContext; grammar/parse-time diagnostics are returned alongside.
 */

import { IRContext, type Resource } from '@sirenpm/core';
import { decodeSyntaxDocuments, type ParseDiagnostic } from './decoder/index';
import type { ParseError, ParseResult } from './parser/adapter';
import type { SyntaxDocument, SyntaxResource } from './syntax/types';

export interface CreateIRContextResult {
  readonly context: IRContext;
  readonly parseDiagnostics: readonly ParseDiagnostic[];
}

/**
 * Decode parsed syntax documents into an IRContext.
 *
 * @param syntaxDocuments - Parsed document model values from parser output
 */
export function createIRContextFromSyntaxDocuments(
  syntaxDocuments: readonly SyntaxDocument[],
): CreateIRContextResult {
  const { document, diagnostics: parseDiagnostics } = decodeSyntaxDocuments(syntaxDocuments);
  const resources: readonly Resource[] = document?.resources ?? [];
  const source = syntaxDocuments.length === 1 ? syntaxDocuments[0]?.source.name : undefined;
  const context = IRContext.fromResources(resources, source);
  return { context, parseDiagnostics };
}

function toDiagnosticColumn(column: number | undefined): number | undefined {
  if (column === undefined) return undefined;
  return Math.max(0, column - 1);
}

function isDuplicateCompleteParseError(error: ParseError): boolean {
  return (
    (error.severity ?? 'error') === 'warning' &&
    error.kind === 'unexpected_token' &&
    error.found === 'complete' &&
    (error.expected ?? []).includes('{') &&
    error.message.includes("duplicate 'complete' keyword")
  );
}

function findResourceForParseError(
  error: ParseError,
  syntaxDocuments: readonly SyntaxDocument[],
): SyntaxResource | undefined {
  const documentName = error.document;
  const startByte = error.startByte;

  for (const syntaxDocument of syntaxDocuments) {
    if (documentName && syntaxDocument.source.name !== documentName) continue;

    for (const resource of syntaxDocument.resources) {
      if (startByte !== undefined) {
        if (startByte >= resource.span.startByte && startByte <= resource.span.endByte) {
          return resource;
        }
      } else if (
        error.line >= resource.span.startRow + 1 &&
        error.line <= resource.span.endRow + 1
      ) {
        return resource;
      }
    }
  }

  return undefined;
}

function parseErrorsToDiagnostics(
  errors: readonly ParseError[],
  syntaxDocuments: readonly SyntaxDocument[],
): readonly ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];

  for (const error of errors) {
    if (isDuplicateCompleteParseError(error)) {
      const resource = findResourceForParseError(error, syntaxDocuments);
      const resourceId = resource?.identifier.value ?? 'unknown';
      diagnostics.push({
        code: 'WL002',
        message: `Resource '${resourceId}' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.`,
        severity: 'warning',
        file: resource?.span.document ?? error.document,
        line: resource ? resource.span.startRow + 1 : error.line,
        column: resource ? 0 : toDiagnosticColumn(error.column),
      });
      continue;
    }

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
export function createIRContextFromParseResult(parseResult: ParseResult): CreateIRContextResult {
  const syntaxDocuments = parseResult.syntaxDocuments ?? [];
  const result = createIRContextFromSyntaxDocuments(syntaxDocuments);
  const parserDiagnostics = parseErrorsToDiagnostics(parseResult.errors, syntaxDocuments);

  return {
    context: result.context,
    parseDiagnostics: [...parserDiagnostics, ...result.parseDiagnostics],
  };
}
