/**
 * Syntax lint pass.
 *
 * Runs between the CST/builder output and `SyntaxResource` finalization.
 * Owns the canonical collapse of `statusKeywords` (the raw token list from
 * the CST) into a single validated `statusKeyword`, and emits parse-phase
 * diagnostics describing problems found in that collapse.
 *
 * Rules:
 *   - 0 tokens                  → `statusKeyword = undefined`
 *   - 1 token                   → `statusKeyword = thatToken`, then validate.
 *   - >1 tokens                 → emit WL002, `statusKeyword = lastToken`,
 *                                 then validate.
 *   - winning token unknown     → emit WL003 and clear `statusKeyword`.
 *
 * The raw `statusKeywords` array is always carried through unchanged so
 * downstream tools can still inspect every token authored in source.
 */

import type { ParseDiagnostic } from '../decoder/index';
import type { SyntaxDocument, SyntaxResource } from './types';

const VALID_STATUS_KEYWORDS: ReadonlySet<string> = new Set(['complete', 'draft']);

export interface LintSyntaxResult {
  readonly documents: readonly SyntaxDocument[];
  readonly diagnostics: readonly ParseDiagnostic[];
}

interface LintResourceResult {
  readonly resource: SyntaxResource;
  readonly diagnostics: readonly ParseDiagnostic[];
}

export function lintSyntaxDocuments(documents: readonly SyntaxDocument[]): LintSyntaxResult {
  const diagnostics: ParseDiagnostic[] = [];
  const lintedDocuments = documents.map((document) => ({
    ...document,
    resources: document.resources.map((resource) => {
      const result = lintResource(resource);
      diagnostics.push(...result.diagnostics);
      return result.resource;
    }),
  }));
  return { documents: lintedDocuments, diagnostics };
}

function lintResource(resource: SyntaxResource): LintResourceResult {
  const tokens = resource.statusKeywords;
  if (tokens.length === 0) {
    return { resource: { ...resource, statusKeyword: undefined }, diagnostics: [] };
  }

  const winner = tokens[tokens.length - 1];
  if (!winner) {
    return { resource: { ...resource, statusKeyword: undefined }, diagnostics: [] };
  }

  const diagnostics: ParseDiagnostic[] = [];

  if (tokens.length > 1) {
    diagnostics.push({
      code: 'WL002',
      message: `resource '${resource.identifier.value}' has multiple status keywords; treated as '${winner.raw}'`,
      severity: 'warning',
      file: resource.span.document,
      line: resource.span.startRow + 1,
      column: 0,
    });
  }

  if (!VALID_STATUS_KEYWORDS.has(winner.raw)) {
    diagnostics.push({
      code: 'WL003',
      message: `unknown status keyword '${winner.raw}' on resource '${resource.identifier.value}'; status will be ignored`,
      severity: 'warning',
      file: resource.span.document,
      line: resource.span.startRow + 1,
      column: 0,
    });
    return { resource: { ...resource, statusKeyword: undefined }, diagnostics };
  }

  return { resource: { ...resource, statusKeyword: winner }, diagnostics };
}
