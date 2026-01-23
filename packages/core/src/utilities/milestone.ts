import type { Resource } from '../ir/types.js';
import { isArray, isReference } from '../ir/types.js';

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

/**
 * Returns a Map where keys are milestone IDs and values are arrays of incomplete tasks that the milestone depends on.
 * @param resources Array of Siren resources
 * @returns Map<string, Resource[]>
 */
export function getTasksByMilestone(resources: Resource[]): Map<string, Resource[]> {
  const taskMap = new Map(resources.filter((r) => r.type === 'task').map((r) => [r.id, r]));
  const tasksByMilestone = new Map<string, Resource[]>();

  // Initialize map with all milestones
  const milestones = resources.filter((r) => r.type === 'milestone');
  for (const milestone of milestones) {
    const dependsOn = getDependsOn(milestone);
    const tasks = dependsOn
      .map((id) => taskMap.get(id))
      .filter((task): task is Resource => task !== undefined && !task.complete);
    tasksByMilestone.set(milestone.id, tasks);
  }

  return tasksByMilestone;
}

/**
 * Extracts dependency IDs from a resource's depends_on attribute.
 * @param resource The resource to extract dependencies from
 * @returns Array of dependency IDs
 */
function getDependsOn(resource: Resource): string[] {
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
