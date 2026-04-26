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
 * Returns true when the resource is complete.
 *
 * Reads from the new `status` field as the source of truth. When `status`
 * is undefined (legacy IR not yet migrated by `ds-context-promotion`),
 * falls back to the legacy `complete` boolean for back-compat.
 */
export function isComplete(resource: Resource): boolean {
  return (
    resource.status === 'complete' || (resource.status === undefined && resource.complete === true)
  );
}

/**
 * Returns true when the resource is in the draft state.
 *
 * Draft is only carried by the new `status` field; it cannot be derived
 * from any legacy attribute.
 */
export function isDraft(resource: Resource): boolean {
  return resource.status === 'draft';
}

/**
 * Returns true when the resource is active (neither complete nor draft).
 *
 * Defined as the negation of {@link isComplete} and {@link isDraft} so
 * the three predicates are mutually exclusive and exhaustive over a
 * fully-resolved Resource.
 */
export function isActive(resource: Resource): boolean {
  return !isComplete(resource) && !isDraft(resource);
}

// TODO expose this as a method on an object oriented IR context
