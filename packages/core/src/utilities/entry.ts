import type { Resource, ResourceBeforeDerivation } from '../ir/types';
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

export function isComplete(resource: Pick<Resource, 'status'>): boolean {
  return resource.status === 'complete';
}

export function isDraft(resource: Pick<Resource, 'status'>): boolean {
  return resource.status === 'draft';
}

export function isActive(resource: Pick<Resource, 'status'>): boolean {
  return resource.status === 'active';
}

export function withDerivedCompletionFlags(resource: ResourceBeforeDerivation): Resource {
  return {
    ...resource,
    complete: isComplete(resource),
    draft: isDraft(resource),
  };
}

// TODO expose this as a method on an object oriented IR context
