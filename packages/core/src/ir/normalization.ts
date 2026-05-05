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
  return applyImplicitMilestoneCompletion(
    resources,
    indexResourcesById(resources),
    buildDependencyGraph(resources),
  );
}

/**
 * Apply implicit-milestone completion using a caller-provided index and graph.
 * The pipeline uses this variant to avoid rebuilding the graph and index that
 * later modules (cycles, dangling) also need.
 */
export function applyImplicitMilestoneCompletion(
  resources: readonly Resource[],
  resourcesById: ReadonlyMap<string, Resource>,
  dependencyGraph: DirectedGraph,
): readonly Resource[] {
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
