import { isReference, type Resource } from '../ir/types';

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
 *
 * Reads the tuple-first shape: depends_on is a Tuple (readonly Atom[]) of
 * atoms. Only reference atoms contribute dependency ids; scalar atoms are
 * ignored. An absent attribute or an empty tuple both yield no dependencies.
 */
export function getDependsOn(resource: Resource): string[] {
  const attr = resource.attributes.find((a) => a.key === 'depends_on');
  if (!attr) return [];
  const ids: string[] = [];
  for (const atom of attr.value) {
    if (isReference(atom)) ids.push(atom.id);
  }
  return ids;
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
