/**
 * Bridge: decode syntax documents into an IRContext while surfacing parse-phase
 * diagnostics separately. Semantic diagnostics ride on the returned
 * IRContext; grammar/parse-time diagnostics are returned alongside.
 */

import { IRContext, type Resource } from '@sirenpm/core';
import { decodeSyntaxDocuments, type ParseDiagnostic } from './decoder/index';
import type { ParseResult } from './parser/adapter';
import type { SyntaxDocument } from './syntax/types';

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

/**
 * Decode parser output into an IRContext using `ParseResult.syntaxDocuments`.
 */
export function createIRContextFromParseResult(parseResult: ParseResult): CreateIRContextResult {
  return createIRContextFromSyntaxDocuments(parseResult.syntaxDocuments ?? []);
}
