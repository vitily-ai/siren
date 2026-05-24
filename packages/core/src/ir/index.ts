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
export { SirenCoreError } from './errors';
export type {
  ChangeMode,
  DocumentChange,
  PatchResult,
  ResourceChange,
} from './patch-result';
export type {
  Atom,
  Attribute,
  Resource,
  ResourceReference,
  ResourceStatus,
  ResourceType,
  Tuple,
} from './types';
