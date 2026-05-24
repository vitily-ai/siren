/**
 * @sirenpm/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export { buildMetadata } from './build-metadata';
// IR context with semantic diagnostics
export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DiagnosticBase,
  DuplicateIdDiagnostic,
} from './ir/diagnostics';
// IR types (intermediate representation), SirenBuilder, SirenProject, and SirenCoreError
export * from './ir/index';
// Origin is IR-agnostic positional metadata
// Atom/Tuple types and reference guard
export type { Atom, Origin, Tuple } from './ir/types';
export { isReference } from './ir/types';
// Dependency tree utilities
export type { DependencyTree } from './utilities/dependency-tree';
export { isComplete, isDraft } from './utilities/entry';
export { version } from './version';
