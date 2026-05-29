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
  EntryChange,
  PatchResult,
} from './patch-result';
export type {
  Atom,
  Attribute,
  EntryReference,
  EntryStatus,
  EntryType,
  SirenEntry,
  Tuple,
} from './types';
