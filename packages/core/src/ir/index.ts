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
export type { SirenDocument } from './document';
export type {
  ArrayValue,
  Attribute,
  AttributeValue,
  PrimitiveValue,
  Resource,
  ResourceReference,
  ResourceStatus,
  ResourceType,
} from './types';
