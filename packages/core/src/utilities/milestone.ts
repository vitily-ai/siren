import type { Resource } from '../ir/types.js';

/**
 * Extracts milestone IDs from an array of resources.
 * @param resources Array of Siren resources
 * @returns Array of milestone IDs
 */
export function getMilestoneIds(resources: Resource[]): string[] {
  return resources
    .filter((resource) => resource.type === 'milestone')
    .map((resource) => resource.id);
}
