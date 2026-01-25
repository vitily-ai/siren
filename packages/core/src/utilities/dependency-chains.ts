import type { Resource } from '../ir/types.js';
import { isArray, isReference } from '../ir/types.js';
import { DirectedGraph } from './graph.js';

/**
 * Collects incomplete leaf dependency chains starting from a given root ID.
 *
 * A dependency chain is a path from the root resource to a leaf resource, where leaves are
 * milestones or incomplete tasks (tasks not marked as complete). Milestones are treated as
 * leaves and their dependencies are not expanded. The traversal respects a maximum depth
 * limit, where depth is the number of dependency edges in the chain (e.g., a chain of 3 IDs
 * has depth 2).
 *
 * Incomplete leaves include:
 * - Milestones (always considered incomplete goals)
 * - Tasks that are not marked complete
 * - Missing/unresolved dependency IDs (treated as incomplete)
 *
 * The function performs a depth-first search from the root, following dependency edges
 * (from dependent to dependency), and collects all valid chains to incomplete leaves within
 * the depth limit. Cycles are avoided by not revisiting nodes in the current path.
 *
 * Future extensibility: The optional comparator allows for custom sorting of chains, which
 * could be extended to support different traversal orders (e.g., breadth-first) or filtering
 * criteria by accepting additional parameters like a filter function for leaves.
 *
 * @param rootId - The ID of the root resource to start traversal from
 * @param resources - Array of all Siren resources in the project
 * @param maxDepth - Maximum number of dependency edges to traverse (0 means only check root)
 * @param comparator - Optional comparator function to sort the returned chains
 * @returns Array of dependency chains, each chain is an array of resource IDs from root to leaf
 */
export function getIncompleteLeafDependencyChains(
  rootId: string,
  resources: readonly Resource[],
  maxDepth: number,
  comparator?: (a: string[], b: string[]) => number,
): string[][] {
  const graph = buildDependencyGraph(resources);
  const resourceMap = new Map(resources.map((r) => [r.id, r]));
  const chains: string[][] = [];

  function dfs(currentId: string, path: string[], depth: number): void {
    path.push(currentId);

    const resource = resourceMap.get(currentId);
    const isMilestone = resource?.type === 'milestone';
    const isIncompleteTask = resource?.type === 'task' && !resource.complete;
    const isMissing = !resource;
    const isIncomplete = isMissing || isMilestone || isIncompleteTask;
    const hasSuccessors = graph.getSuccessors(currentId).length > 0;
    const isLeaf =
      (isMilestone && currentId !== rootId) ||
      (resource?.type === 'task' && !hasSuccessors) ||
      isMissing;

    if (isLeaf && isIncomplete) {
      chains.push([...path]);
    } else if (depth < maxDepth && !isMissing) {
      // Only expand if not missing and within depth
      for (const successor of graph.getSuccessors(currentId)) {
        if (path.includes(successor)) {
          // Detected a cycle. Only emit a sentinel chain when the original
          // traversal root is a milestone so callers (CLI) can present a
          // concise loop indicator for milestones. For task-root cycles,
          // do not emit anything (preserve previous behavior of returning
          // no chains for pure cycles).
          const rootResource = resourceMap.get(rootId);
          if (rootResource?.type === 'milestone') {
            const sentinel = '... (dependency loop - check warnings)';
            const firstDep = path[1];
            if (firstDep) {
              chains.push([rootId, firstDep, sentinel]);
            } else {
              chains.push([rootId, sentinel]);
            }
          }
        } else {
          dfs(successor, path, depth + 1);
        }
      }
    }

    path.pop();
  }

  dfs(rootId, [], 0);

  if (comparator) {
    chains.sort(comparator);
  }

  return chains;
}

/**
 * Build a directed graph of resource dependencies from depends_on attributes.
 * @param resources Array of Siren resources
 * @returns DirectedGraph where edges represent dependencies (from dependent to dependency)
 */
function buildDependencyGraph(resources: readonly Resource[]): DirectedGraph {
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
