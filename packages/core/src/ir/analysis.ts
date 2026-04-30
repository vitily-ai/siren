import { getDependsOn } from '../utilities/entry';
import type { DirectedGraph } from '../utilities/graph';
import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';
import {
  firstOccurrencePositionForResource,
  positionForResource,
  secondOccurrenceAttributionForResource,
  sourceFileForResource,
  sourceFilesForResourceIds,
} from './source-attribution';
import type { Resource } from './types';

export interface SemanticAnalysisInput {
  readonly rawResources: readonly Resource[];
  readonly resources: readonly Resource[];
  readonly resourcesById: ReadonlyMap<string, Resource>;
  readonly dependencyGraph: DirectedGraph;
}

export interface SemanticAnalysisSnapshot {
  readonly cycles: readonly DependencyCycle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
  readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
}

export function analyzeResources(input: SemanticAnalysisInput): SemanticAnalysisSnapshot {
  const cycles = detectDependencyCycles(input.dependencyGraph);
  const cycleDiagnostics = diagnoseCycles(cycles, input.resourcesById);
  const danglingDiagnostics = diagnoseDanglingDependencies(input.resources, input.resourcesById);
  const duplicateDiagnostics = diagnoseDuplicateResources(input.rawResources);

  return Object.freeze({
    cycles,
    diagnostics: orderSemanticDiagnostics({
      cycleDiagnostics,
      danglingDiagnostics,
      duplicateDiagnostics,
    }),
    danglingDiagnostics,
    duplicateDiagnostics,
  });
}

export function detectDependencyCycles(graph: DirectedGraph): readonly DependencyCycle[] {
  return Object.freeze(
    graph
      .getCycles()
      .map((cycle): DependencyCycle => Object.freeze({ nodes: Object.freeze(cycle.slice()) })),
  );
}

export function diagnoseCycles(
  cycles: readonly DependencyCycle[],
  resourcesById: ReadonlyMap<string, Resource>,
): readonly CircularDependencyDiagnostic[] {
  const diagnostics: CircularDependencyDiagnostic[] = [];

  for (const cycle of cycles) {
    const firstNodeId = cycle.nodes[0];
    const firstResource = firstNodeId === undefined ? undefined : resourcesById.get(firstNodeId);

    diagnostics.push(
      freezeDiagnostic({
        code: 'W001',
        severity: 'warning',
        nodes: cycle.nodes,
        ...sourceFilesForResourceIds(cycle.nodes, resourcesById),
        ...positionForResource(firstResource),
      }),
    );
  }

  return Object.freeze(diagnostics);
}

export function diagnoseDanglingDependencies(
  resources: readonly Resource[],
  resourcesById: ReadonlyMap<string, Resource>,
): readonly DanglingDependencyDiagnostic[] {
  const diagnostics: DanglingDependencyDiagnostic[] = [];

  for (const resource of resources) {
    const dependsOn = getDependsOn(resource);
    for (const dependencyId of dependsOn) {
      if (!resourcesById.has(dependencyId)) {
        diagnostics.push(
          freezeDiagnostic({
            code: 'W002',
            severity: 'warning',
            resourceId: resource.id,
            resourceType: resource.type,
            dependencyId,
            ...sourceFilesForResourceIds([resource.id], resourcesById),
            ...positionForResource(resource),
          }),
        );
      }
    }
  }

  return Object.freeze(diagnostics);
}

export function diagnoseDuplicateResources(
  rawResources: readonly Resource[],
): readonly DuplicateIdDiagnostic[] {
  const diagnostics: DuplicateIdDiagnostic[] = [];
  const firstResourcesById = new Map<string, Resource>();

  for (const resource of rawResources) {
    const firstResource = firstResourcesById.get(resource.id);
    if (firstResource !== undefined) {
      diagnostics.push(
        freezeDiagnostic({
          code: 'W003',
          severity: 'warning',
          resourceId: resource.id,
          resourceType: resource.type,
          file: sourceFileForResource(resource),
          firstFile: sourceFileForResource(firstResource),
          ...firstOccurrencePositionForResource(firstResource),
          ...secondOccurrenceAttributionForResource(resource),
        }),
      );
    } else {
      firstResourcesById.set(resource.id, resource);
    }
  }

  return Object.freeze(diagnostics);
}

export function orderSemanticDiagnostics(input: {
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

function freezeDiagnostic<TDiagnostic extends Diagnostic>(diagnostic: TDiagnostic): TDiagnostic {
  return Object.freeze(diagnostic);
}
