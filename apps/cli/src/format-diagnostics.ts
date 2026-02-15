/**
 * CLI diagnostic formatter
 *
 * Formats structured diagnostics from core into standardized CLI output:
 * `file:line:col: code: message`
 */

import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
  ParseDiagnostic,
} from '@siren/core';

/**
 * Format a diagnostic for CLI display
 *
 * Output format: `file:line:col: code: message`
 *
 * - W004 (Circular dependency): message assembled from `nodes` array
 * - W005 (Dangling dependency): message assembled from resource info and dependency
 * - W001/W002/W003/E001: message passed through from ParseDiagnostic
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
 * For W006 (duplicate ID), position is the duplicate (second) occurrence.
 */
function formatPrefix(diagnostic: Diagnostic | ParseDiagnostic): string {
  const file = diagnostic.file ?? 'unknown';

  // W006 uses secondLine/secondColumn for the diagnostic position
  if (diagnostic.code === 'W006') {
    const dup = diagnostic as DuplicateIdDiagnostic;
    const line = dup.secondLine ?? 0;
    const column = dup.secondColumn ?? 0;
    return `${file}:${line}:${column}`;
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
    case 'W004':
      return formatCircularDependency(diagnostic as CircularDependencyDiagnostic);
    case 'W005':
      return formatDanglingDependency(diagnostic as DanglingDependencyDiagnostic);
    case 'W006':
      return formatDuplicateId(diagnostic as DuplicateIdDiagnostic);
    default:
      // W001, W002, W003, E001 - pass through message
      return (diagnostic as ParseDiagnostic).message;
  }
}

/**
 * Format W004: Circular dependency detected
 */
function formatCircularDependency(diagnostic: CircularDependencyDiagnostic): string {
  const chain = (diagnostic.nodes ?? []).join(' -> ');
  return `Circular dependency detected: ${chain}`;
}

/**
 * Format W005: Dangling dependency
 */
function formatDanglingDependency(diagnostic: DanglingDependencyDiagnostic): string {
  const { resourceType, resourceId, dependencyId } = diagnostic;
  return `Dangling dependency: ${resourceType ?? 'undefined'} '${resourceId ?? 'undefined'}' depends on '${dependencyId ?? 'undefined'}'`;
}

/**
 * Format W006: Duplicate resource ID detected
 */
// TODO formalize {document}:{line}:{column} as a canonical address format in core diagnostics and refactor to use that consistently across all diagnostics for accurate CLI formatting without needing augmentation in the CLI layer.
function formatDuplicateId(diagnostic: DuplicateIdDiagnostic): string {
  const { resourceType, resourceId, firstLine, firstColumn, firstFile } = diagnostic;
  const firstLocation = `${firstLine ?? 0}:${firstColumn ?? 0}`;
  const firstWithFile = firstFile ? `${firstFile}:${firstLocation}` : firstLocation;
  return `Duplicate resource ID detected: ${resourceType} '${resourceId}' first defined at ${firstWithFile}`;
}
