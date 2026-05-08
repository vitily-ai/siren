import { isComplete, isDraft } from '../../../utilities/entry';
import { ResourceGraph } from '../../resource-graph';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Determines whether a milestone is implicitly complete.
 *
 * A milestone is implicitly complete when it has at least one dependency
 * (`depends_on`) and every dependency is itself complete — either explicitly
 * via `status: 'complete'`, or implicitly through this same rule (recursive).
 * Explicit drafts (`status: 'draft'`) are never promoted implicitly.
 * Orphan milestones (no `depends_on`) are never implicitly complete.
 * Only milestones can be implicitly complete; tasks cannot.
 *
 * Uses {@link ResourceGraph.dfs} for traversal and cycle detection rather
 * than hand-rolling recursion.
 *
 * @param resource The resource to check
 * @param graph Dependency graph built from the same resource set
 * @returns true if the resource is an implicitly-complete milestone
 */
function isImplicitlyComplete(resource: Resource, graph: ResourceGraph): boolean {
  if (resource.type !== 'milestone') return false;
  if (isDraft(resource)) return false; // explicit draft must not be auto-promoted

  const deps = graph.getSuccessors(resource.id);
  if (deps.length === 0) return false; // orphan — never implicitly complete

  let allComplete = true;

  graph.dfs(
    resource.id,
    (node, _path, depth) => {
      if (depth === 0) return true; // root milestone — expand

      const dep = graph.getResource(node);
      if (!dep) {
        allComplete = false;
        return false; // dangling ref — not complete
      }
      if (isComplete(dep)) return false; // explicit complete status — satisfied
      if (isDraft(dep)) {
        allComplete = false;
        return false; // explicit draft is terminal — never implicitly complete
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

/**
 * Apply implicit-milestone completion using a caller-provided index and graph.
 * The pipeline uses this variant to avoid rebuilding the graph and index that
 * later modules (cycles, dangling) also need.
 */
function applyImplicitMilestoneCompletion(graph: ResourceGraph): ResourceGraph {
  const resources = graph.resources;

  const resolvedResources = resources.map(
    (resource): Resource =>
      !isComplete(resource) && isImplicitlyComplete(resource, graph)
        ? { ...resource, status: 'complete' }
        : resource,
  );

  return ResourceGraph.fromResources(resolvedResources);
}

/**
 * Implicit-completion module.
 *
 * Reads:  { graph }
 * Writes: { graph }    // logical replacement
 *
 * Implicit completion only writes `status: 'complete'` on milestones whose
 * dependencies are all complete. The stable baseline reconstructs a fresh
 * ResourceGraph from the resolved resource snapshot.
 */
export const ImplicitCompletionModule = defineModule(
  'ImplicitCompletion',
  (input: {
    readonly graph: ResourceGraph;
  }): {
    readonly graph: ResourceGraph;
  } => {
    return { graph: applyImplicitMilestoneCompletion(input.graph) };
  },
);
