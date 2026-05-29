import { isComplete, isDraft } from '../../../utilities/entry';
import { EntryGraph } from '../../entry-graph';
import type { SirenEntry } from '../../types';
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
 * Uses {@link EntryGraph.dfs} for traversal and cycle detection rather
 * than hand-rolling recursion.
 *
 * @param entry The entry to check
 * @param graph Dependency graph built from the same entry set
 * @returns true if the entry is an implicitly-complete milestone
 */
function isImplicitlyComplete(entry: SirenEntry, graph: EntryGraph): boolean {
  if (entry.type !== 'milestone') return false;
  if (isDraft(entry)) return false; // explicit draft must not be auto-promoted

  const deps = graph.getSuccessors(entry.id);
  if (deps.length === 0) return false; // orphan — never implicitly complete

  let allComplete = true;

  graph.dfs(
    entry.id,
    (node, _path, depth) => {
      if (depth === 0) return true; // root milestone — expand

      const dep = graph.getEntry(node);
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
function applyImplicitMilestoneCompletion(graph: EntryGraph): EntryGraph {
  const entries = graph.entries;

  const resolvedEntries = entries.map(
    (entry): SirenEntry =>
      !isComplete(entry) && isImplicitlyComplete(entry, graph)
        ? { ...entry, status: 'complete' }
        : entry,
  );

  return EntryGraph.fromEntries(resolvedEntries);
}

/**
 * Implicit-completion module.
 *
 * Reads:  { graph }
 * Writes: { graph }    // logical replacement
 *
 * Implicit completion only writes `status: 'complete'` on milestones whose
 * dependencies are all complete. The stable baseline reconstructs a fresh
 * EntryGraph from the resolved entry snapshot.
 */
export const ImplicitCompletionModule = defineModule(
  'ImplicitCompletion',
  (input: {
    readonly graph: EntryGraph;
  }): {
    readonly graph: EntryGraph;
  } => {
    return { graph: applyImplicitMilestoneCompletion(input.graph) };
  },
);
