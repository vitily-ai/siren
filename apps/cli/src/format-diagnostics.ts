/**
 * CLI diagnostic formatter
 *
 * Formats structured diagnostics into standardized CLI output:
 * `file:line:col: code: message`
 *
 * Parse errors (EL001/EL002/EL003) additionally render a caret-snippet block
 * below the header when `source` is supplied and the diagnostic carries a
 * range `origin`.
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
  EL001FallbackDiagnostic,
  EL002MissingTokenDiagnostic,
  EL003UnexpectedTokenDiagnostic,
  LanguageDiagnostic,
  Origin,
  RangeOrigin,
  WL001UnrecognizedModifierDiagnostic,
  WL002CollapsedModifiersDiagnostic,
} from '@sirenpm/language';
import { clamp, renderCaretSnippet, rowStartByte } from './format-parse-error';

/** Resolve a referenced entry's source origin (provided by the project snapshot). */
export type OriginResolver = (entryId: string) => Origin | undefined;

export type AnyDiagnostic = Diagnostic | LanguageDiagnostic;

/**
 * Format a diagnostic for CLI display.
 *
 * When `source` is provided and the diagnostic has a range `origin`, a caret-
 * snippet block is appended after the header line for parse errors.
 *
 * Output format: `file:line:col: code: message`
 * (with optional caret snippet for parse errors)
 */
export function formatDiagnostic(
  diagnostic: AnyDiagnostic,
  resolveOrigin?: OriginResolver,
  source?: string,
): string {
  const origin = originForDiagnostic(diagnostic, resolveOrigin);
  const prefix = formatPrefix(origin, source);
  const message = formatMessage(diagnostic);
  const header = `${prefix}: ${diagnostic.code}: ${message}`;

  // Append caret snippet for parse errors when source text is available.
  if (source && origin?.kind === 'range') {
    const isParseError =
      diagnostic.code === 'EL001' || diagnostic.code === 'EL002' || diagnostic.code === 'EL003';
    if (isParseError) {
      const snippet = renderCaretSnippet(origin as RangeOrigin, source);
      return `${header}\n${snippet}`;
    }
  }

  return header;
}

/**
 * Compute the 1-based column from a byte offset and row.
 * Falls back to 0 when source is unavailable.
 */
function columnFromOrigin(origin: RangeOrigin, source?: string): number {
  if (!source) return 0;
  const lineStart = rowStartByte(source, origin.startRow);
  const lines = source.split(/\r?\n/u);
  const lineText = lines[origin.startRow] ?? '';
  return clamp(origin.startByte - lineStart + 1, 1, lineText.length + 1);
}

/** Convert an `Origin` (or its absence) into a `file:line:col` prefix. */
function formatPrefix(origin: Origin | undefined, source?: string): string {
  const file = origin?.document ?? 'unknown';
  if (origin && origin.kind === 'range') {
    const col = columnFromOrigin(origin as RangeOrigin, source);
    return `${file}:${origin.startRow + 1}:${col}`;
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
    case 'EL002':
    case 'EL003':
    case 'WL001':
    case 'WL002':
      return (
        diagnostic as
          | EL001FallbackDiagnostic
          | WL001UnrecognizedModifierDiagnostic
          | WL002CollapsedModifiersDiagnostic
      ).origin;
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
      return formatSyntaxExclusion(diagnostic as EL001FallbackDiagnostic);
    case 'EL002':
      return formatMissingToken(diagnostic as EL002MissingTokenDiagnostic);
    case 'EL003':
      return formatUnexpectedToken(diagnostic as EL003UnexpectedTokenDiagnostic);
    case 'WL001':
      return formatUnknownStatus(diagnostic as WL001UnrecognizedModifierDiagnostic);
    case 'WL002':
      return formatCollapsedStatus(diagnostic as WL002CollapsedModifiersDiagnostic);
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
function formatSyntaxExclusion(diagnostic: EL001FallbackDiagnostic): string {
  if (diagnostic.resourceId) {
    return `could not parse resource '${diagnostic.resourceId}'`;
  }
  return `could not parse ${diagnostic.nodeType}`;
}

/** EL002: Missing required token. */
function formatMissingToken(diagnostic: EL002MissingTokenDiagnostic): string {
  const subject = diagnostic.resourceId ? ` in resource '${diagnostic.resourceId}'` : '';
  return `missing '${diagnostic.missingToken}'${subject}`;
}

/** EL003: Unexpected token with expected alternatives. */
function formatUnexpectedToken(diagnostic: EL003UnexpectedTokenDiagnostic): string {
  const list = diagnostic.expected.slice(0, 5).join("', '");
  const suffix = diagnostic.expected.length > 5 ? '\u2026' : '';
  const subject = diagnostic.resourceId ? ` in resource '${diagnostic.resourceId}'` : '';
  return `unexpected token${subject}; expected '${list}'${suffix}`;
}

/** WL001: Unrecognized status modifier ignored. */
function formatUnknownStatus(diagnostic: WL001UnrecognizedModifierDiagnostic): string {
  return `Unrecognized status modifier '${diagnostic.modifier}' on '${diagnostic.resourceId}' was ignored`;
}

/** WL002: Multiple recognized status modifiers collapsed (last wins). */
function formatCollapsedStatus(diagnostic: WL002CollapsedModifiersDiagnostic): string {
  const modifiers = diagnostic.recognizedModifiers.join(', ');
  return `Resource '${diagnostic.resourceId}' has multiple status modifiers (${modifiers}); resolved to '${diagnostic.resolvedStatus}'`;
}
