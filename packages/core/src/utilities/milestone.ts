import type { EntryGraph } from '../ir/entry-graph';
import type { SirenEntry } from '../ir/types';
import { isComplete } from './entry';

/**
 * Extracts milestone IDs from an array of entries.
 * @param entries Array of Siren entries
 * @returns Array of milestone IDs
 */
export function getMilestoneIds(entries: readonly SirenEntry[]): string[] {
  return entries.filter((entry) => entry.type === 'milestone').map((entry) => entry.id);
}

// TODO this needs to just be a flattening wrapper over getDependencyTree(depth=1) - it is effectively the same traversal
/**
 * Returns a Map where keys are milestone IDs and values are arrays of tasks
 * that are not explicitly complete. Draft and no-status tasks remain visible.
 * @param graph Entry graph snapshot
 * @returns Map<string, SirenEntry[]>
 */

export function getTasksByMilestone(graph: EntryGraph): Map<string, SirenEntry[]> {
  const entries = graph.entries;
  const taskMap = new Map(entries.filter((r) => r.type === 'task').map((r) => [r.id, r]));
  const tasksByMilestone = new Map<string, SirenEntry[]>();

  // Initialize map with all milestones
  const milestones = entries.filter((r) => r.type === 'milestone');
  for (const milestone of milestones) {
    const dependsOnIds = graph.getSuccessors(milestone.id);
    const tasks = dependsOnIds
      .map((id) => taskMap.get(id))
      .filter((task): task is SirenEntry => task !== undefined && !isComplete(task));
    tasksByMilestone.set(milestone.id, tasks);
  }

  return tasksByMilestone;
}
