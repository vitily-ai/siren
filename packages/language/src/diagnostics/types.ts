import type { DiagnosticBase, Origin } from '@sirenpm/core';

/**
 * EL001 — Resource excluded from AST due to parse errors in its subtree.
 *
 * Emitted by the AST builder (in `lang-ast-builder`) once per excluded resource.
 * `resourceId` is optional because a resource whose identifier itself failed to
 * parse cannot supply one.
 */
export interface EL001Diagnostic extends DiagnosticBase {
  readonly code: 'EL001';
  readonly severity: 'error';
  readonly resourceId?: string;
  readonly documentName: string;
  readonly nodeType: string;
  readonly origin?: Origin;
}

/**
 * WL001 — Unrecognized status modifier.
 *
 * Emitted once per unrecognized modifier token on a resource. The recognized
 * set is `complete` and `draft`; anything else triggers this warning.
 */
export interface WL001Diagnostic extends DiagnosticBase {
  readonly code: 'WL001';
  readonly severity: 'warning';
  readonly resourceId: string;
  readonly modifier: string;
  readonly documentName: string;
  readonly origin?: Origin;
}

/**
 * WL002 — Multiple recognized status modifiers collapsed.
 *
 * Emitted when more than one recognized modifier is supplied; last-recognized
 * wins and the surplus modifiers are reported via this diagnostic.
 */
export interface WL002Diagnostic extends DiagnosticBase {
  readonly code: 'WL002';
  readonly severity: 'warning';
  readonly resourceId: string;
  readonly recognizedModifiers: readonly string[];
  readonly resolvedStatus: string;
  readonly documentName: string;
  readonly origin?: Origin;
}

/**
 * Discriminated union of all language-phase diagnostics, keyed by `code`.
 */
export type LanguageDiagnostic = EL001Diagnostic | WL001Diagnostic | WL002Diagnostic;

export interface EL001Input {
  readonly resourceId?: string;
  readonly documentName: string;
  readonly nodeType: string;
  readonly origin?: Origin;
}

export interface WL001Input {
  readonly resourceId: string;
  readonly modifier: string;
  readonly documentName: string;
  readonly origin?: Origin;
}

export interface WL002Input {
  readonly resourceId: string;
  readonly recognizedModifiers: readonly string[];
  readonly resolvedStatus: string;
  readonly documentName: string;
  readonly origin?: Origin;
}

export function createEL001(input: EL001Input): EL001Diagnostic {
  return Object.freeze({
    code: 'EL001' as const,
    severity: 'error' as const,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    documentName: input.documentName,
    nodeType: input.nodeType,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createWL001(input: WL001Input): WL001Diagnostic {
  return Object.freeze({
    code: 'WL001' as const,
    severity: 'warning' as const,
    resourceId: input.resourceId,
    modifier: input.modifier,
    documentName: input.documentName,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createWL002(input: WL002Input): WL002Diagnostic {
  return Object.freeze({
    code: 'WL002' as const,
    severity: 'warning' as const,
    resourceId: input.resourceId,
    recognizedModifiers: input.recognizedModifiers,
    resolvedStatus: input.resolvedStatus,
    documentName: input.documentName,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}
