/**
 * Diagnostic code constants for core (IR/context) diagnostics.
 *
 * Prefix convention:
 *   WC- = warning from core
 *   EC- = error from core
 */
export const CoreDiagnosticCode = {
  /** Circular dependency detected in resource graph */
  CIRCULAR_DEPENDENCY: 'WC-001',
  /** Resource depends on a non-existent resource */
  DANGLING_DEPENDENCY: 'WC-002',
  /** Multiple resources share the same ID */
  DUPLICATE_ID: 'WC-003',
} as const;

export type CoreDiagnosticCodeValue = (typeof CoreDiagnosticCode)[keyof typeof CoreDiagnosticCode];
