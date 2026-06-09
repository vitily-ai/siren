/**
 * CLI diagnostic formatter
 *
 * Formats structured diagnostics into standardized CLI output:
 * `file:line:col: code: message`
 *
 * Under ADR-0006 core diagnostics (W001/W002/W003) no longer carry source
 * positions — they reference entries by id. The CLI resolves positions by
 * looking up each referenced entry's language-owned `Origin` via an injected
 * resolver. Language diagnostics (EL001/WL001/WL002) carry their own optional
 * `origin` and structured fields; the CLI assembles display text from them.
 */

import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from '@sirenpm/core';
import type {
  EL001Diagnostic,
  LanguageDiagnostic,
  Origin,
  WL001Diagnostic,
  WL002Diagnostic,
} from '@sirenpm/language';

/** Resolve a referenced entry's source origin (provided by the project snapshot). */
export type OriginResolver = (entryId: string) => Origin | undefined;

export type AnyDiagnostic = Diagnostic | LanguageDiagnostic;

/**
 * Format a diagnostic for CLI display.
 *
 * Output format: `file:line:col: code: message`
 */
export function formatDiagnostic(diagnostic: AnyDiagnostic, resolveOrigin?: OriginResolver): string {
  const origin = originForDiagnostic(diagnostic, resolveOrigin);
  const prefix = formatPrefix(origin);
  const message = formatMessage(diagnostic);
  return `${prefix}: ${diagnostic.code}: ${message}`;
}

/** Convert an `Origin` (or its absence) into a `file:line:col` prefix. */
function formatPrefix(origin: Origin | undefined): string {
  const file = origin?.document ?? 'unknown';
  if (origin && origin.kind === 'range') {
    return `${file}:${origin.startRow + 1}:0`;
  }
  return `${file}:0:0`;
}

/**
 * Resolve the source origin a diagnostic should point at.
 *
 * - Core diagnostics carry entry ids; resolve via the project snapshot.
 * - Language diagnostics carry their own optional `origin`.
 */
function originForDiagnostic(
  diagnostic: AnyDiagnostic,
  resolveOrigin?: OriginResolver,
): Origin | undefined {
  switch (diagnostic.code) {
    case 'W001': {
      const start = (diagnostic as CircularDependencyDiagnostic).nodes?.[0];
      return start ? resolveOrigin?.(start) : undefined;
    }
    case 'W002':
      return resolveOrigin?.((diagnostic as DanglingDependencyDiagnostic).entryId);
    case 'W003':
      return resolveOrigin?.((diagnostic as DuplicateIdDiagnostic).entryId);
    case 'EL001':
    case 'WL001':
    case 'WL002':
      return (diagnostic as EL001Diagnostic | WL001Diagnostic | WL002Diagnostic).origin;
    default:
      return undefined;
  }
}

/** Assemble the human-readable message from a diagnostic's structured fields. */
function formatMessage(diagnostic: AnyDiagnostic): string {
  switch (diagnostic.code) {
    case 'W001':
      return formatCircularDependency(diagnostic as CircularDependencyDiagnostic);
    case 'W002':
      return formatDanglingDependency(diagnostic as DanglingDependencyDiagnostic);
    case 'W003':
      return formatDuplicateId(diagnostic as DuplicateIdDiagnostic);
    case 'EL001':
      return formatSyntaxExclusion(diagnostic as EL001Diagnostic);
    case 'WL001':
      return formatUnknownStatus(diagnostic as WL001Diagnostic);
    case 'WL002':
      return formatCollapsedStatus(diagnostic as WL002Diagnostic);
    default:
      return diagnostic.code;
  }
}

/** W001: Circular dependency detected */
function formatCircularDependency(diagnostic: CircularDependencyDiagnostic): string {
  const chain = (diagnostic.nodes ?? []).join(' -> ');
  return `Circular dependency detected: ${chain}`;
}

/** W002: Dangling dependency */
function formatDanglingDependency(diagnostic: DanglingDependencyDiagnostic): string {
  const { entryType, entryId, dependencyId } = diagnostic;
  return `Dangling dependency: ${entryType} '${entryId}' depends on '${dependencyId}'`;
}

/**
 * W003: Duplicate entry ID detected
 *
 * Core no longer carries the first-occurrence position (ADR-0006), so the
 * message is reduced to the entry identity. First-occurrence attribution would
 * require the CLI to track entry ordering/origins itself.
 */
function formatDuplicateId(diagnostic: DuplicateIdDiagnostic): string {
  const { entryType, entryId } = diagnostic;
  return `Duplicate entry ID detected: ${entryType} '${entryId}'`;
}

/** EL001: Resource excluded from the AST due to a parse error in its subtree. */
function formatSyntaxExclusion(diagnostic: EL001Diagnostic): string {
  const subject = diagnostic.resourceId ? ` '${diagnostic.resourceId}'` : '';
  return `Invalid syntax: could not parse ${diagnostic.nodeType}${subject}`;
}

/** WL001: Unrecognized status modifier ignored. */
function formatUnknownStatus(diagnostic: WL001Diagnostic): string {
  return `Unrecognized status modifier '${diagnostic.modifier}' on '${diagnostic.resourceId}' was ignored`;
}

/** WL002: Multiple recognized status modifiers collapsed (last wins). */
function formatCollapsedStatus(diagnostic: WL002Diagnostic): string {
  const modifiers = diagnostic.recognizedModifiers.join(', ');
  return `Resource '${diagnostic.resourceId}' has multiple status modifiers (${modifiers}); resolved to '${diagnostic.resolvedStatus}'`;
}
