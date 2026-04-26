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
  DuplicateIdDiagnostic,
} from './ir/context';
export type { DiagnosticBase } from './ir/diagnostics';
export type { IRExporter } from './ir/exporter';
// IR types (intermediate representation) and IRContext
export * from './ir/index';
// Origin is IR-agnostic positional metadata
export type { Origin } from './ir/types';
// Type guards for AttributeValue discrimination
export { isArray, isPrimitive, isReference } from './ir/types';
// Dependency tree utilities
export type { DependencyTree } from './utilities/dependency-tree';
// Resource status predicates
export { isActive, isComplete, isDraft } from './utilities/entry';
export { resolveStatus } from './utilities/milestone';
export { version } from './version';
