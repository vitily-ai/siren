import { ResourceGraph } from '../../resource-graph';
import { defineModule } from '../types';

/**
 * Implicit-draft milestone module.
 *
 * A milestone resource with no successors (no `depends_on`) and no explicit
 * status is assigned `status: 'draft'`. This module must run before
 * {@link ImplicitCompletionModule} so that completion reasoning always sees
 * orphan milestones as explicitly drafted rather than inferring the rule itself.
 *
 * Reads:  { graph }
 * Writes: { graph }    // logical replacement when any milestone is drafted
 *
 * @see ImplicitCompletionModule
 */
export const ImplicitDraftMilestoneModule = defineModule(
  'ImplicitDraftMilestone',
  (input: {
    readonly graph: ResourceGraph;
  }): {
    readonly graph: ResourceGraph;
  } => {
    let changed = false;
    const newResources = input.graph.resources.map((resource) => {
      if (resource.type === 'milestone' && resource.status === undefined) {
        const successors = input.graph.getSuccessors(resource.id);
        if (successors.length === 0) {
          changed = true;
          return { ...resource, status: 'draft' as const };
        }
      }
      return resource;
    });

    if (changed) {
      return { graph: ResourceGraph.fromResources(newResources) };
    }
    return { graph: input.graph };
  },
);
