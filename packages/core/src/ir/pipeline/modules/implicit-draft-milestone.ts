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
    // TODO: implement — stub returns input graph unchanged
    return { graph: input.graph };
  },
);
