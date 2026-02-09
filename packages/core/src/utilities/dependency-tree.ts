import type { Resource } from '../ir/types.js';
import { isArray, isReference } from '../ir/types.js';
import { DirectedGraph } from './graph.js';

const MAX_DEPTH = 1000000;

export interface DependencyTree {
  resource: Resource;
  dependencies: DependencyTree[];
  /** If true, this node represents a detected cycle */
  cycle?: boolean;
  /** If true, this node represents a missing referenced resource */
  missing?: boolean;
}

export function getDependencyTree(
  rootId: string,
  resources: readonly Resource[],
  expandPredicate: (resource: Resource) => boolean = (r) => getDependsOn(r).length > 0,
): DependencyTree {
  const graph = buildDependencyGraph(resources);
  const rootResource = resources.find((r) => r.id === rootId);
  if (!rootResource) {
    throw new Error(`Resource with id ${rootId} not found`);
  }

  const resourcesById = new Map(resources.map((r) => [r.id, r] as const));

  const visited = new Set<string>();
  const stack: string[] = [];

  return buildDependencyTree(
    rootResource,
    graph,
    expandPredicate,
    resourcesById,
    visited,
    stack,
    0,
  );
}

function buildDependencyTree(
  root: Resource,
  graph: DirectedGraph,
  expandPredicate: (resource: Resource) => boolean = (r) => getDependsOn(r).length > 0,
  resourcesById?: Map<string, Resource>,
  visited?: Set<string>,
  stack?: string[],
  depth = 0,
): DependencyTree {
  if (depth > MAX_DEPTH) {
    throw new Error('maximum dependency depth exceeded');
  }

  const resourcesMap = resourcesById ?? new Map();
  const path = stack ?? [];
  const tree: DependencyTree = { resource: root, dependencies: [] };

  // If expandPredicate says not to expand this node, return as leaf
  if (!expandPredicate(root)) return tree;

  const successors = graph.getSuccessors(root.id) ?? [];

  // mark current node on the recursion path for cycle detection
  path.push(root.id);

  for (const succId of successors) {
    // detect cycle: successor already on current recursion path
    if (path.includes(succId)) {
      const cycResource = resourcesMap.get(succId) ?? {
        type: 'task',
        id: succId,
        complete: false,
        attributes: [],
      };
      const cycNode: DependencyTree = { resource: cycResource, dependencies: [], cycle: true };
      tree.dependencies.push(cycNode);
      continue;
    }

    // get the resource object for successor; if missing create a placeholder
    const succResource = resourcesMap.get(succId) ?? {
      type: 'task',
      id: succId,
      complete: false,
      attributes: [],
    };

    // recurse
    const child = buildDependencyTree(
      succResource,
      graph,
      expandPredicate,
      resourcesMap,
      visited,
      path,
      depth + 1,
    );

    // if the child resource was created as placeholder (not in original map), mark missing
    if (!resourcesMap.has(succId)) {
      child.missing = true;
    }

    tree.dependencies.push(child);
  }

  // remove current node from recursion path
  path.pop();

  return tree;
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
