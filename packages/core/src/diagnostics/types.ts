/**
 * Core diagnostic type interfaces.
 *
 * Semantic diagnostics produced by IR analysis use the WC- prefix.
 * All diagnostic types carry an optional `source` string for attribution,
 * matching the format used by Resource.source (e.g. "file:line:col").
 */

import type { CoreDiagnosticCode } from './codes.js';

/**
 * Base interface that all diagnostics (core, parser, etc.) must satisfy.
 * Used as the generic bound for DiagnosticBag.
 */
export interface BaseDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
}

/**
 * Discriminated union of all core semantic diagnostics.
 */
export type Diagnostic =
  | DanglingDependencyDiagnostic
  | CircularDependencyDiagnostic
  | DuplicateIdDiagnostic;

/**
 * WC-001: Circular dependency detected in the resource graph.
 */
export interface CircularDependencyDiagnostic {
  readonly code: typeof CoreDiagnosticCode.CIRCULAR_DEPENDENCY;
  readonly severity: 'warning';
  /** Nodes in the cycle, with the first node repeated at the end */
  readonly nodes: readonly string[];
  /** Source attribution (serialized "file:line:col" from the first node) */
  readonly source?: string;
}

/**
 * WC-002: Resource depends on a non-existent resource.
 */
export interface DanglingDependencyDiagnostic {
  readonly code: typeof CoreDiagnosticCode.DANGLING_DEPENDENCY;
  readonly severity: 'warning';
  /** ID of the resource that has the dangling dependency */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** ID of the missing dependency */
  readonly dependencyId: string;
  /** Source attribution (serialized "file:line:col") */
  readonly source?: string;
}

/**
 * WC-003: Multiple resources share the same ID.
 */
export interface DuplicateIdDiagnostic {
  readonly code: typeof CoreDiagnosticCode.DUPLICATE_ID;
  readonly severity: 'warning';
  /** ID of the duplicate resource */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** Source attribution of the duplicate (second) occurrence */
  readonly source?: string;
  /** Source attribution of the first (precedent) occurrence */
  readonly firstSource?: string;
}
