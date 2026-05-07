import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from '../../diagnostics';
import { defineModule } from '../types';

function orderSemanticDiagnostics(input: {
  readonly cycleDiagnostics: readonly CircularDependencyDiagnostic[];
  readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
  readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
}): readonly Diagnostic[] {
  return Object.freeze([
    ...input.cycleDiagnostics,
    ...input.danglingDiagnostics,
    ...input.duplicateDiagnostics,
  ]);
}

/**
 * Finalize module: collapse the per-rule diagnostic arrays into the single
 * ordered `diagnostics` snapshot exposed by SirenProject (W001 → W002 → W003).
 *
 * Reads:  { cycleDiagnostics, danglingDiagnostics, duplicateDiagnostics }
 * Writes: { diagnostics }
 */
export const FinalizeModule = defineModule(
  'Finalize',
  (input: {
    readonly cycleDiagnostics: readonly CircularDependencyDiagnostic[];
    readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
    readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
  }): { readonly diagnostics: readonly Diagnostic[] } => {
    return { diagnostics: orderSemanticDiagnostics(input) };
  },
);
