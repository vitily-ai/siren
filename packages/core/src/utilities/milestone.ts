import type { Resource, ResourceStatus } from '../ir/types';
import { getDependsOn, isComplete } from './entry';
import { DirectedGraph } from './graph';

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
      .filter((task): task is Resource => task !== undefined && !isComplete(task));
    tasksByMilestone.set(milestone.id, tasks);
  }

  return tasksByMilestone;
}

/**
 * Determines whether a milestone is implicitly complete.
 *
 * A milestone is implicitly complete when it has at least one dependency
 * (`depends_on`) and every dependency is itself complete — either explicitly
 * via the `complete` keyword, or implicitly through this same rule (recursive).
 * Orphan milestones (no `depends_on`) are never implicitly complete.
 * Only milestones can be implicitly complete; tasks cannot.
 *
 * Uses {@link DirectedGraph.dfs} for traversal and cycle detection rather
 * than hand-rolling recursion.
 *
 * @param resource The resource to check
 * @param resourceMap Lookup map of all resources by ID
 * @param graph Dependency graph built from the same resource set
 * @returns true if the resource is an implicitly-complete milestone
 */
export function isImplicitlyComplete(
  resource: Resource,
  resourceMap: ReadonlyMap<string, Resource>,
  graph: DirectedGraph,
): boolean {
  if (resource.type !== 'milestone') return false;

  const deps = graph.getSuccessors(resource.id);
  if (deps.length === 0) return false; // orphan — never implicitly complete

  let allComplete = true;

  graph.dfs(
    resource.id,
    (node, _path, depth) => {
      if (depth === 0) return true; // root milestone — expand

      const dep = resourceMap.get(node);
      if (!dep) {
        allComplete = false;
        return false; // dangling ref — not complete
      }
      if (isComplete(dep)) return false; // complete — satisfied
      if (dep.status === 'draft') {
        allComplete = false;
        return false;
      }

      // Incomplete milestone with deps: expand to check transitively
      if (dep.type === 'milestone' && graph.getSuccessors(node).length > 0) {
        return true;
      }

      // Incomplete task or orphan milestone
      allComplete = false;
      return false;
    },
    {
      onBackEdge: () => {
        allComplete = false;
      },
    },
  );

  return allComplete;
}

export function resolveStatus(
  resource: Resource,
  resourceMap: ReadonlyMap<string, Resource>,
  graph: DirectedGraph,
): ResourceStatus {
  if (resource.type === 'task') return resource.status;
  if (resource.status !== 'active') return resource.status;
  if (isImplicitlyComplete(resource, resourceMap, graph)) return 'complete';
  if (graph.getSuccessors(resource.id).length === 0) return 'draft';
  return 'active';
}

/**
 * Build a directed graph of resource dependencies from depends_on attributes.
 * @param resources Array of Siren resources
 * @returns DirectedGraph where edges represent dependencies
 */
export function buildDependencyGraph(resources: readonly Resource[]): DirectedGraph {
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
