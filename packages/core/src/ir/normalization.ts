import type { DirectedGraph } from '../utilities/graph';
import { buildDependencyGraph, isImplicitlyComplete } from '../utilities/milestone';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export interface NormalizedResourceSnapshot {
  readonly resources: readonly Resource[];
  readonly resourcesById: ReadonlyMap<string, Resource>;
  readonly dependencyGraph: DirectedGraph;
}

export function normalizeResources(rawResources: readonly Resource[]): NormalizedResourceSnapshot {
  const deduplicatedResources = deduplicateResources(rawResources);
  const resources = resolveImplicitMilestoneCompletion(deduplicatedResources);

  return Object.freeze({
    resources,
    resourcesById: indexResourcesById(resources),
    dependencyGraph: buildDependencyGraph(resources),
  });
}

export function deduplicateResources(rawResources: readonly Resource[]): readonly Resource[] {
  const seen = new Set<string>();
  const resources: Resource[] = [];

  for (const resource of rawResources) {
    if (!seen.has(resource.id)) {
      seen.add(resource.id);
      resources.push(resource);
    }
  }

  return Object.freeze(resources);
}

export function resolveImplicitMilestoneCompletion(
  resources: readonly Resource[],
): readonly Resource[] {
  const resourcesById = indexResourcesById(resources);
  const dependencyGraph = buildDependencyGraph(resources);
  const resolvedResources = resources.map(
    (resource): Resource =>
      !resource.complete && isImplicitlyComplete(resource, resourcesById, dependencyGraph)
        ? { ...resource, complete: true }
        : resource,
  );

  return cloneAndFreezeResources(resolvedResources);
}

export function indexResourcesById(resources: readonly Resource[]): ReadonlyMap<string, Resource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}
