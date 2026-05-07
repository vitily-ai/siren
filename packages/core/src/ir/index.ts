/**
 * IR module exports
 */

export { SirenBuilder } from './assembly';
export { SirenProject } from './context';
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
