import type { Resource } from './types';

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
