import type { Resource } from '../ir/types.js';
import { isArray, isReference } from '../ir/types.js';
import { DirectedGraph } from './graph.js';

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

  // Build dependency graph
  const graph = buildDependencyGraph(resources);

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

/**
 * Build a directed graph of resource dependencies from depends_on attributes.
 * @param resources Array of Siren resources
 * @returns DirectedGraph where edges represent dependencies
 */
function buildDependencyGraph(resources: Resource[]): DirectedGraph {
  const graph = new DirectedGraph();

  for (const resource of resources) {
    graph.addNode(resource.id);
    const dependsOn = getDependsOn(resource);
    for (const depId of dependsOn) {
      graph.addEdge(resource.id, depId);
    }
  }

  return graph;
}
