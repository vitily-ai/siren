/**
 * IR module exports
 */

export { IRAssembly } from './assembly';
export { IRContext } from './context';
export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DiagnosticBase,
  DuplicateIdDiagnostic,
} from './diagnostics';
export type {
  ArrayValue,
  Attribute,
  AttributeValue,
  Cycle,
  Document,
  PrimitiveValue,
  Resource,
  ResourceReference,
  ResourceType,
} from './types';
