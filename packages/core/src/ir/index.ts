/**
 * IR module exports
 */

export { IRAssembly } from './assembly';
export { IRContext } from './context';
export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DiagnosticBase,
  DuplicateIdDiagnostic,
} from './diagnostics';
export type {
  ArrayValue,
  Attribute,
  AttributeValue,
  PrimitiveValue,
  Resource,
  ResourceReference,
  ResourceType,
} from './types';
