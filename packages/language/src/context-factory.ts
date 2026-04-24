/**
 * Bridge: decode a CST into an IRContext while surfacing parse-phase
 * diagnostics separately. Semantic diagnostics ride on the returned
 * IRContext; grammar/parse-time diagnostics are returned alongside.
 */

import { IRContext, type Resource } from '@sirenpm/core';
import { decodeDocument, type ParseDiagnostic } from './decoder/index';
import type { DocumentNode } from './parser/cst';

export interface CreateIRContextResult {
  readonly context: IRContext;
  readonly parseDiagnostics: readonly ParseDiagnostic[];
}

/**
 * Decode a single parsed document into an IRContext.
 *
 * @param cst - Root CST node from `createParser().parse(...)`
 * @param source - Optional source file path used for diagnostic attribution
 *                 when the CST nodes lack origin.document
 */
export function createIRContextFromCst(cst: DocumentNode, source?: string): CreateIRContextResult {
  const { document, diagnostics: parseDiagnostics } = decodeDocument(cst, source);
  const resources: readonly Resource[] = document?.resources ?? [];
  const context = IRContext.fromResources(resources, source);
  return { context, parseDiagnostics };
}
