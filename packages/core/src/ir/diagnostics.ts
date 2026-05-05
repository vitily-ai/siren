/**
 * Shared base shape for all Siren diagnostics (semantic and, in future, parse/decode).
 *
 * `message` is intentionally absent: frontends (CLI, web, editors) assemble
 * display text from the structured fields of each concrete diagnostic variant.
 */
export interface DiagnosticBase {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  /** Source file path (when available) */
  readonly file?: string;
  /** 1-based line number (when available) */
  readonly line?: number;
  /** 0-based column number (when available) */
  readonly column?: number;
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
 * W002: Dangling dependency (resource depends on non-existent resource)
 */
export interface DanglingDependencyDiagnostic extends DiagnosticBase {
  readonly code: 'W002';
  readonly severity: 'warning';
  /** ID of the resource that has the dangling dependency */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
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
 * W003: Duplicate resource ID detected
 *
 * Emitted when multiple resources share the same ID. The first occurrence is kept,
 * and all subsequent occurrences are dropped with a warning. File attribution
 * is derived from each resource's origin.document field.
 */
export interface DuplicateIdDiagnostic extends DiagnosticBase {
  readonly code: 'W003';
  readonly severity: 'warning';
  /** ID of the duplicate resource */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** 1-based line number of the first (precedent) occurrence */
  readonly firstLine?: number;
  /** 0-based column number of the first (precedent) occurrence */
  readonly firstColumn?: number;
  /** Source file path of the first (precedent) occurrence (from origin.document) */
  readonly firstFile?: string;
  /** 1-based line number of the duplicate (second) occurrence - used for diagnostic position */
  readonly secondLine?: number;
  /** 0-based column number of the duplicate (second) occurrence */
  readonly secondColumn?: number;
}
