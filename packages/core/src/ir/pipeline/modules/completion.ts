import type { DirectedGraph } from '../../../utilities/graph';
import { indexResourcesById } from '../../normalization';
import { cloneAndFreezeResources } from '../../snapshot';
import type { Resource } from '../../types';
import { defineModule } from '../types';

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
function isImplicitlyComplete(
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
      if (dep.complete) return false; // explicitly complete — satisfied

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

/**
 * Apply implicit-milestone completion using a caller-provided index and graph.
 * The pipeline uses this variant to avoid rebuilding the graph and index that
 * later modules (cycles, dangling) also need.
 */
function applyImplicitMilestoneCompletion(
  resources: readonly Resource[],
  resourcesById: ReadonlyMap<string, Resource>,
  dependencyGraph: DirectedGraph,
): readonly Resource[] {
  const resolvedResources = resources.map(
    (resource): Resource =>
      !resource.complete && isImplicitlyComplete(resource, resourcesById, dependencyGraph)
        ? { ...resource, complete: true }
        : resource,
  );

  return cloneAndFreezeResources(resolvedResources);
}

/**
 * Implicit-completion module.
 *
 * Reads:  { resources, resourcesById, graph }
 * Writes: { resources, resourcesById }    // logical replacement
 *
 * Implicit completion only flips `complete: true` on milestones whose
 * dependencies are all complete. It does not change ids or `depends_on`,
 * so the dependency `graph` remains valid and is NOT rebuilt.
 *
 * The `resourcesById` map, however, holds Resource references whose
 * `complete` flag has now changed, so the module returns a fresh index
 * over the resolved resource array.
 *
 * If `resources` is referentially unchanged (no implicit promotions),
 * the module returns the same envelope values to avoid unnecessary churn.
 */
export const ImplicitCompletionModule = defineModule(
  'ImplicitCompletion',
  (input: {
    readonly resources: readonly Resource[];
    readonly resourcesById: ReadonlyMap<string, Resource>;
    readonly graph: DirectedGraph;
  }): {
    readonly resources: readonly Resource[];
    readonly resourcesById: ReadonlyMap<string, Resource>;
  } => {
    const resolved = applyImplicitMilestoneCompletion(
      input.resources,
      input.resourcesById,
      input.graph,
    );
    if (resolved === input.resources) {
      return { resources: input.resources, resourcesById: input.resourcesById };
    }
    return { resources: resolved, resourcesById: indexResourcesById(resolved) };
  },
);
