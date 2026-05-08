import type { Resource } from '../ir/types';
import { isArray, isReference } from '../ir/types';

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

/**
 * Extracts dependency IDs from a resource's depends_on attribute.
 * Non-reference values are ignored.
 */
export function getDependsOn(resource: Resource): string[] {
  const attr = resource.attributes.find((a) => a.key === 'depends_on');
  if (!attr) return [];

  const value = attr.value;
  if (isReference(value)) {
    return [value.id];
  }
  if (isArray(value)) {
    return value.elements.filter(isReference).map((ref) => ref.id);
  }
  return [];
}

/**
 * Helper to check for resource completion status. This does not guarantee explicit completion.
 */
export function isComplete(resource: Resource): resource is Resource & { status: 'complete' } {
  return resource.status === 'complete';
}

/**
 * Helper to check for resource draft status. This does not guarantee explicit draft status.
 */
export function isDraft(resource: Resource): resource is Resource & { status: 'draft' } {
  return resource.status === 'draft';
}

// TODO expose this as a method on an object oriented IR context
