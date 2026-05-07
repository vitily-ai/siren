import type { DirectedGraph } from '../utilities/graph';
import type { Resource } from './types';

export interface NormalizedResourceSnapshot {
  readonly resources: readonly Resource[];
  readonly resourcesById: ReadonlyMap<string, Resource>;
  readonly dependencyGraph: DirectedGraph;
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

// TODO this needs to be an implementation detail of the graph
export function indexResourcesById(resources: readonly Resource[]): ReadonlyMap<string, Resource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}
