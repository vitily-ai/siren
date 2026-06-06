const SEVERITY_MAP = {
  I: 'info',
  W: 'warning',
  E: 'error',
} as const;

type DiagnosticSeverity = keyof typeof SEVERITY_MAP;

type PackageChar =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | '';

type DiagnosticCode<
  S extends DiagnosticSeverity = DiagnosticSeverity,
  P extends PackageChar = PackageChar,
> = `${S}${P}${number}`;

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
}

/**
 * Shared base shape for all Siren diagnostics (semantic and, in future, parse/decode).
 *
 * `message` is intentionally absent: frontends (CLI, web, editors) assemble
 * display text from the structured fields of each concrete diagnostic variant.
 */
export interface DiagnosticBase<S extends DiagnosticSeverity, P extends PackageChar>
  extends Diagnostic {
  readonly code: DiagnosticCode<S, P>;
  readonly severity: (typeof SEVERITY_MAP)[S];
}

interface CoreDiagnostic<S extends DiagnosticSeverity> extends DiagnosticBase<S, ''> {}

/**
 * Semantic diagnostic message produced from IR analysis.
 *
 * Structured as a discriminated union by code.
 */

export interface DependencyCycle {
  /** Nodes in the cycle, with the first node repeated at the end. */
  readonly nodes: readonly string[];
}

/**
 * W002: Dangling dependency (entry depends on non-existent entry)
 */
export interface DanglingDependencyDiagnostic extends CoreDiagnostic<'W'> {
  readonly code: 'W002';
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
export interface CircularDependencyDiagnostic extends CoreDiagnostic<'W'> {
  readonly code: 'W001';
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
export interface DuplicateIdDiagnostic extends CoreDiagnostic<'W'> {
  readonly code: 'W003';
  /** ID of the duplicate entry */
  readonly entryId: string;
  /** Type of the entry (task or milestone) */
  readonly entryType: 'task' | 'milestone';
}
