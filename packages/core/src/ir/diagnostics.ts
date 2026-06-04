/**
 * Shared base shape for all Siren diagnostics (semantic and, in future, parse/decode).
 *
 * `message` is intentionally absent: frontends (CLI, web, editors) assemble
 * display text from the structured fields of each concrete diagnostic variant.
 */
export interface DiagnosticBase {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
}

/**
 * Semantic diagnostic message produced from IR analysis.
 *
 * Structured as a discriminated union by code.
 */
export type Diagnostic =
  | DanglingDependencyDiagnostic
  | CircularDependencyDiagnostic
  | DuplicateIdDiagnostic;

export interface DependencyCycle {
  /** Nodes in the cycle, with the first node repeated at the end. */
  readonly nodes: readonly string[];
}

/**
 * W002: Dangling dependency (entry depends on non-existent entry)
 */
export interface DanglingDependencyDiagnostic extends DiagnosticBase {
  readonly code: 'W002';
  readonly severity: 'warning';
  /** ID of the entry that has the dangling dependency */
  readonly entryId: string;
  /** Type of the entry (task or milestone) */
  readonly entryType: 'task' | 'milestone';
  /** ID of the missing dependency */
  readonly dependencyId: string;
}

/**
 * W001: Circular dependency detected
 */
export interface CircularDependencyDiagnostic extends DiagnosticBase {
  readonly code: 'W001';
  readonly severity: 'warning';
  /** Nodes in the cycle, with the first node repeated at the end (e.g., ['a', 'b', 'c', 'a']) */
  readonly nodes: readonly string[];
}

/**
 * W003: Duplicate entry ID detected
 *
 * Emitted when multiple entries share the same ID. The first occurrence is kept,
 * and all subsequent occurrences are dropped with a warning. The ordering of
 * first vs second occurrence is determined by array position — core does not
 * need origin to establish precedence.
 */
export interface DuplicateIdDiagnostic extends DiagnosticBase {
  readonly code: 'W003';
  readonly severity: 'warning';
  /** ID of the duplicate entry */
  readonly entryId: string;
  /** Type of the entry (task or milestone) */
  readonly entryType: 'task' | 'milestone';
}
