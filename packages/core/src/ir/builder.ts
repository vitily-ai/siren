import { analyzeResources } from './analysis';
import type {
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';
import { normalizeResources } from './normalization';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export interface IRContextSnapshot {
  readonly rawResources: readonly Resource[];
  readonly resources: readonly Resource[];
  readonly cycles: readonly DependencyCycle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
  readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
}

export function buildIRContextSnapshot(resources: readonly Resource[]): IRContextSnapshot {
  const rawResources = cloneAndFreezeResources(resources);
  const normalized = normalizeResources(rawResources);
  const analysis = analyzeResources({
    rawResources,
    resources: normalized.resources,
    resourcesById: normalized.resourcesById,
    dependencyGraph: normalized.dependencyGraph,
  });

  return Object.freeze({
    rawResources,
    resources: normalized.resources,
    cycles: analysis.cycles,
    diagnostics: analysis.diagnostics,
    danglingDiagnostics: analysis.danglingDiagnostics,
    duplicateDiagnostics: analysis.duplicateDiagnostics,
  });
}
