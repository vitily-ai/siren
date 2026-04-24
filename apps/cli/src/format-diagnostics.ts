/**
 * CLI diagnostic formatter
 *
 * Formats structured diagnostics into standardized CLI output:
 * `file:line:col: code: message`
 */

import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from '@sirenpm/core';
import type { ParseDiagnostic } from '@sirenpm/language';

/**
 * Format a diagnostic for CLI display
 *
 * Output format: `file:line:col: code: message`
 *
 * - W001 (Circular dependency): message assembled from `nodes` array
 * - W002 (Dangling dependency): message assembled from resource info and dependency
 * - W003 (Duplicate ID): message assembled from duplicate metadata
 * - WL001/WL002/WL003/EL001: message passed through from ParseDiagnostic
 *
 * @param diagnostic - Structured diagnostic from core (Diagnostic or ParseDiagnostic)
 * @returns Formatted diagnostic string
 */
export function formatDiagnostic(diagnostic: Diagnostic | ParseDiagnostic): string {
  const prefix = formatPrefix(diagnostic);
  const message = formatMessage(diagnostic);
  return `${prefix}: ${diagnostic.code}: ${message}`;
}

/**
 * Format the position prefix (file:line:col)
 *
 * For duplicate ID diagnostics, position is the duplicate (second) occurrence.
 */
function formatPrefix(diagnostic: Diagnostic | ParseDiagnostic): string {
  const file = diagnostic.file ?? 'unknown';

  // Duplicate-ID diagnostics use secondLine/secondColumn for the diagnostic position.
  if (diagnostic.code === 'W003' || diagnostic.code === 'WL003') {
    const dup = diagnostic as Partial<DuplicateIdDiagnostic>;
    const line = dup.secondLine ?? 0;
    const column = dup.secondColumn ?? 0;
    if (line !== 0 || column !== 0) {
      return `${file}:${line}:${column}`;
    }
  }

  // All other diagnostic types have standard line/column
  const withPos = diagnostic as { line?: number; column?: number };
  const line = withPos.line ?? 0;
  const column = withPos.column ?? 0;
  return `${file}:${line}:${column}`;
}

/**
 * Format the diagnostic message based on code
 */
function formatMessage(diagnostic: Diagnostic | ParseDiagnostic): string {
  switch (diagnostic.code) {
    case 'W001':
      return formatCircularDependency(diagnostic as CircularDependencyDiagnostic);
    case 'W002':
      return formatDanglingDependency(diagnostic as DanglingDependencyDiagnostic);
    case 'W003':
      if ('resourceId' in diagnostic) {
        return formatDuplicateId(diagnostic as DuplicateIdDiagnostic);
      }
      return (diagnostic as ParseDiagnostic).message;
    default:
      // WL001, WL002, WL003, EL001 - pass through message
      return (diagnostic as ParseDiagnostic).message;
  }
}

/**
 * Format W001: Circular dependency detected
 */
function formatCircularDependency(diagnostic: CircularDependencyDiagnostic): string {
  const chain = (diagnostic.nodes ?? []).join(' -> ');
  return `Circular dependency detected: ${chain}`;
}

/**
 * Format W002: Dangling dependency
 */
function formatDanglingDependency(diagnostic: DanglingDependencyDiagnostic): string {
  const { resourceType, resourceId, dependencyId } = diagnostic;
  return `Dangling dependency: ${resourceType ?? 'undefined'} '${resourceId ?? 'undefined'}' depends on '${dependencyId ?? 'undefined'}'`;
}

/**
 * Format W003: Duplicate resource ID detected
 */
// TODO formalize {document}:{line}:{column} as a canonical address format in core diagnostics and refactor to use that consistently across all diagnostics for accurate CLI formatting without needing augmentation in the CLI layer.
function formatDuplicateId(diagnostic: DuplicateIdDiagnostic): string {
  const { resourceType, resourceId, firstLine, firstColumn, firstFile } = diagnostic;
  const firstLocation = `${firstLine ?? 0}:${firstColumn ?? 0}`;
  const firstWithFile = firstFile ? `${firstFile}:${firstLocation}` : firstLocation;
  return `Duplicate resource ID detected: ${resourceType} '${resourceId}' first defined at ${firstWithFile}`;
}
