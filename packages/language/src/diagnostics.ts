import type { DiagnosticBase } from '@sirenpm/core';
import type { Origin } from './origin';

export type LanguageDiagnostic<S extends 'I' | 'W' | 'E' = 'I' | 'W' | 'E'> = DiagnosticBase<
  S,
  'L'
>;

/**
 * EL001 — Resource excluded from AST due to parse errors in its subtree.
 *
 * Default/fallback parse-error diagnostic emitted when no more specific
 * classification rule matches. See `parse-error-classifier.ts` for the
 * classification pipeline.
 *
 * `resourceId` is optional because a resource whose identifier itself failed to
 * parse cannot supply one.
 */
export interface EL001GenericParseErrorDiagnostic extends LanguageDiagnostic<'E'> {
  readonly code: 'EL001';
  readonly severity: 'error';
  readonly resourceId?: string;
  readonly documentName: string;
  readonly nodeType: string;
  readonly origin?: Origin;
}

/**
 * EL002 — Missing required token.
 *
 * Emitted when tree-sitter inserts a MISSING node — a location where the
 * grammar requires a token but none was present in source. `missingToken`
 * carries the CST type of the absent token (e.g. `"{"`, `"}"`, `"="`).
 */
export interface EL002MissingTokenDiagnostic extends LanguageDiagnostic<'E'> {
  readonly code: 'EL002';
  readonly severity: 'error';
  readonly documentName: string;
  readonly resourceId?: string;
  readonly origin?: Origin;
  /** The CST type of the token that was expected but absent. */
  readonly missingToken: string;
}

/**
 * EL003 — Unexpected token with known expected alternatives.
 *
 * Emitted when tree-sitter encounters an ERROR node and the language's
 * `lookaheadIterator` at the error position yields a non-empty set of valid
 * symbols. `origin` is narrowed to the ERROR token rather than the enclosing
 * resource.
 */
export interface EL003UnexpectedTokenDiagnostic extends LanguageDiagnostic<'E'> {
  readonly code: 'EL003';
  readonly severity: 'error';
  readonly documentName: string;
  readonly resourceId?: string;
  readonly origin?: Origin;
  /** Valid grammar symbols at the error position. */
  readonly expected: readonly string[];
}

/**
 * WL001 — Unrecognized status modifier.
 *
 * Emitted once per unrecognized modifier token on a resource. The recognized
 * set is `complete` and `draft`; anything else triggers this warning.
 */
export interface WL001UnrecognizedModifierDiagnostic extends LanguageDiagnostic<'W'> {
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
export interface WL002CollapsedModifiersDiagnostic extends LanguageDiagnostic<'W'> {
  readonly code: 'WL002';
  readonly severity: 'warning';
  readonly resourceId: string;
  readonly recognizedModifiers: readonly string[];
  readonly resolvedStatus: string;
  readonly documentName: string;
  readonly origin?: Origin;
}

type DiagnosticInput<T extends LanguageDiagnostic> = Omit<T, 'code' | 'severity'>;
export interface EL001Input extends DiagnosticInput<EL001GenericParseErrorDiagnostic> {}
export interface EL002Input extends DiagnosticInput<EL002MissingTokenDiagnostic> {}
export interface EL003Input extends DiagnosticInput<EL003UnexpectedTokenDiagnostic> {}
export interface WL001Input extends DiagnosticInput<WL001UnrecognizedModifierDiagnostic> {}
export interface WL002Input extends DiagnosticInput<WL002CollapsedModifiersDiagnostic> {}

export function createEL001(input: EL001Input): EL001GenericParseErrorDiagnostic {
  return Object.freeze({
    code: 'EL001' as const,
    severity: 'error' as const,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    documentName: input.documentName,
    nodeType: input.nodeType,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createEL002(input: EL002Input): EL002MissingTokenDiagnostic {
  return Object.freeze({
    code: 'EL002' as const,
    severity: 'error' as const,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    documentName: input.documentName,
    missingToken: input.missingToken,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createEL003(input: EL003Input): EL003UnexpectedTokenDiagnostic {
  return Object.freeze({
    code: 'EL003' as const,
    severity: 'error' as const,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    documentName: input.documentName,
    expected: Object.freeze(input.expected),
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createWL001(input: WL001Input): WL001UnrecognizedModifierDiagnostic {
  return Object.freeze({
    code: 'WL001' as const,
    severity: 'warning' as const,
    resourceId: input.resourceId,
    modifier: input.modifier,
    documentName: input.documentName,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
  });
}

export function createWL002(input: WL002Input): WL002CollapsedModifiersDiagnostic {
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
