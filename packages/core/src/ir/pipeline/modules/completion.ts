import type { DirectedGraph } from '../../../utilities/graph';
import { applyImplicitMilestoneCompletion, indexResourcesById } from '../../normalization';
import type { Resource } from '../../types';
import { defineModule } from '../types';

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
