import type { Resource } from '../ir/types.js';

/**
 * Finds a resource by its ID from the given array of resources.
 * @param resources Array of Siren resources
 * @param id The ID of the resource to find
 * @returns The resource with the matching ID
 * @throws Error if no resource with the given ID is found
 */
export function findResourceById(resources: Resource[], id: string): Resource {
  const resource = resources.find((r) => r.id === id);
  if (!resource) {
    throw new Error(`Resource with ID '${id}' not found`);
  }
  return resource;
}
