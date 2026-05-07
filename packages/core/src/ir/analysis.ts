import { getDependsOn } from '../utilities/entry';
import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';
import type { ResourceGraph } from './resource-graph';
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
  readonly dependencyGraph: ResourceGraph;
}

export interface SemanticAnalysisSnapshot {
  readonly cycles: readonly DependencyCycle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
  readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
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

function freezeDiagnostic<TDiagnostic extends Diagnostic>(diagnostic: TDiagnostic): TDiagnostic {
  return Object.freeze(diagnostic);
}
