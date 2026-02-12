import type { Resource } from '../ir/types.js';
import { isArray, isReference } from '../ir/types.js';
import { DirectedGraph } from './graph.js';

const MAX_DEPTH = 1000000;

/**
 * Controls how a node is traversed in the dependency tree.
 * - include: Should this node appear in the tree?
 * - expand: Should we traverse its children?
 */
export interface TraversalControl {
  include: boolean;
  expand: boolean;
}

/**
 * Predicate that controls tree traversal.
 * Returns:
 * - `false` → exclude node entirely (shorthand for { include: false, expand: false })
 * - `true` → include and expand (shorthand for { include: true, expand: true })
 * - `TraversalControl` → explicit control over inclusion and expansion
 */
export type TraversePredicate = (
  resource: Resource,
  parent?: Resource,
) => boolean | TraversalControl;

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
  traversePredicate: TraversePredicate = () => true,
): DependencyTree {
  const graph = buildDependencyGraph(resources);
  const rootResource = resources.find((r) => r.id === rootId);
  if (!rootResource) {
    throw new Error(`Resource with id ${rootId} not found`);
  }

  const resourcesById = new Map(resources.map((r) => [r.id, r] as const));

  return buildDependencyTree(rootResource, graph, traversePredicate, resourcesById);
}

/**
 * Normalize predicate result to TraversalControl.
 */
function normalizeControl(result: boolean | TraversalControl): TraversalControl {
  if (typeof result === 'boolean') {
    return { include: result, expand: result };
  }
  return result;
}

function buildDependencyTree(
  root: Resource,
  graph: DirectedGraph,
  traversePredicate: TraversePredicate = () => true,
  resourcesById?: Map<string, Resource>,
): DependencyTree {
  const resourcesMap = resourcesById ?? new Map();
  const tree: DependencyTree = { resource: root, dependencies: [] };

  // Check if we should expand the root's children
  const rootControl = normalizeControl(traversePredicate(root));
  if (!rootControl.expand) return tree;

  const pathKey = (path: readonly string[]): string => path.join('\u0000');
  const nodesByPath = new Map<string, DependencyTree>();
  nodesByPath.set(pathKey([root.id]), tree);

  graph.dfs(
    root.id,
    (nodeId, path, depth) => {
      if (depth > MAX_DEPTH) {
        throw new Error('maximum dependency depth exceeded');
      }

      if (depth === 0) {
        return rootControl.expand;
      }

      const parentKey = pathKey(path.slice(0, -1));
      const parent = nodesByPath.get(parentKey);
      if (!parent) return false;

      const resource =
        resourcesMap.get(nodeId) ??
        ({
          type: 'task',
          id: nodeId,
          complete: false,
          attributes: [],
        } satisfies Resource);

      // Check traversal predicate with parent context
      const parentResource = parent.resource;
      const control = normalizeControl(traversePredicate(resource, parentResource));

      // If not included, don't add to tree at all
      if (!control.include) {
        return false;
      }

      const child: DependencyTree = { resource, dependencies: [] };
      if (!resourcesMap.has(nodeId)) {
        child.missing = true;
      }

      parent.dependencies.push(child);
      nodesByPath.set(pathKey(path), child);

      // Return whether to expand this node's children
      return control.expand;
    },
    {
      onBackEdge: (_from, to, path) => {
        const parent = nodesByPath.get(pathKey(path));
        if (!parent) return;

        const cycResource =
          resourcesMap.get(to) ??
          ({
            type: 'task',
            id: to,
            complete: false,
            attributes: [],
          } satisfies Resource);

        const cycNode: DependencyTree = { resource: cycResource, dependencies: [], cycle: true };
        parent.dependencies.push(cycNode);
      },
    },
  );

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
