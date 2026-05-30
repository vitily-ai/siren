import { EntryGraph } from '../../entry-graph';
import { defineModule } from '../types';

/**
 * Implicit-draft milestone module.
 *
 * A milestone entry with no successors (no `depends_on`) and no explicit
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
    readonly graph: EntryGraph;
  }): {
    readonly graph: EntryGraph;
  } => {
    let changed = false;
    const newEntries = input.graph.entries.map((entry) => {
      if (entry.type === 'milestone' && entry.status === undefined) {
        const successors = input.graph.getSuccessors(entry.id);
        if (successors.length === 0) {
          changed = true;
          return { ...entry, status: 'draft' as const };
        }
      }
      return entry;
    });

    if (changed) {
      return { graph: EntryGraph.fromEntries(newEntries) };
    }
    return { graph: input.graph };
  },
);
