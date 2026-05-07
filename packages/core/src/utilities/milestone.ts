import type { ResourceGraph } from '../ir/resource-graph';
import type { Resource } from '../ir/types';

/**
 * Extracts milestone IDs from an array of resources.
 * @param resources Array of Siren resources
 * @returns Array of milestone IDs
 */
export function getMilestoneIds(resources: readonly Resource[]): string[] {
  return resources
    .filter((resource) => resource.type === 'milestone')
    .map((resource) => resource.id);
}

// TODO this needs to just be a flattening wrapper over getDependencyTree(depth=1) - it is effectively the same traversal
/**
 * Returns a Map where keys are milestone IDs and values are arrays of incomplete tasks that the milestone depends on.
 * @param graph Resource graph snapshot
 * @returns Map<string, Resource[]>
 */

export function getTasksByMilestone(graph: ResourceGraph): Map<string, Resource[]> {
  const resources = graph.resources;
  const taskMap = new Map(resources.filter((r) => r.type === 'task').map((r) => [r.id, r]));
  const tasksByMilestone = new Map<string, Resource[]>();

  // Initialize map with all milestones
  const milestones = resources.filter((r) => r.type === 'milestone');
  for (const milestone of milestones) {
    const dependsOnIds = graph.getSuccessors(milestone.id);
    const tasks = dependsOnIds
      .map((id) => taskMap.get(id))
      .filter((task): task is Resource => task !== undefined && !task.complete);
    tasksByMilestone.set(milestone.id, tasks);
  }

  return tasksByMilestone;
}
