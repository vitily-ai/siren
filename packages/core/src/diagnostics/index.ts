/**
 * Diagnostics module barrel
 */

export { DiagnosticBag } from './bag.js';
export { CoreDiagnosticCode, type CoreDiagnosticCodeValue } from './codes.js';
export {
  parseSourceAddress,
  type SourceAddress,
  serializeSourceAddress,
} from './source-address.js';
export type {
  BaseDiagnostic,
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './types.js';
