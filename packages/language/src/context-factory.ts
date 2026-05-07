/**
 * Bridge: decode syntax documents into a SirenProject while surfacing parse-phase
 * diagnostics separately. Semantic diagnostics ride on the returned
 * SirenProject; grammar/parse-time diagnostics are returned alongside.
 */

import { type Resource, SirenBuilder, type SirenProject } from '@sirenpm/core';
import { decodeSyntaxDocuments, type ParseDiagnostic } from './decoder/index';
import type { ParseError, ParseResult } from './parser/adapter';
import type { SyntaxDocument, SyntaxResource } from './syntax/types';

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
  const { document, diagnostics: parseDiagnostics } = decodeSyntaxDocuments(syntaxDocuments);
  const resources: readonly Resource[] = document?.resources ?? [];
  const context = SirenBuilder.fromResources(resources).build();
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
export function createSirenProjectFromParseResult(
  parseResult: ParseResult,
): CreateSirenProjectResult {
  const syntaxDocuments = parseResult.syntaxDocuments ?? [];
  const result = createSirenProjectFromSyntaxDocuments(syntaxDocuments);
  const parserDiagnostics = parseErrorsToDiagnostics(parseResult.errors, syntaxDocuments);

  return {
    context: result.context,
    parseDiagnostics: [...parserDiagnostics, ...result.parseDiagnostics],
  };
}
