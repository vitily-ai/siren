/**
 * Parser diagnostic code constants (WP- for warnings, EP- for errors)
 */
export const ParserDiagnosticCode = {
  /** complete keyword + conflicting attribute value */
  COMPLETE_CONFLICT: 'WP-001',
  /** multiple complete keywords on one resource */
  MULTIPLE_COMPLETE: 'WP-002',
  /** complete on unsupported resource type */
  COMPLETE_UNSUPPORTED: 'WP-003',
  /** misplaced or invalid complete keyword */
  COMPLETE_INVALID: 'EP-001',
} as const;

export type ParserDiagnosticCodeValue =
  (typeof ParserDiagnosticCode)[keyof typeof ParserDiagnosticCode];
