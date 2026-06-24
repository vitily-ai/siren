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
export * from './ir/index';
export type {
  Atom,
  EntryStats,
  EntryWithStats,
  ProjectStatus,
  SirenEntry,
  Tuple,
} from './ir/types';
export { isReference } from './ir/types';
export type { DependencyTree } from './utilities/dependency-tree';
export { isComplete, isDraft } from './utilities/entry';
export { version } from './version';
