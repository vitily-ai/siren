import { defineCommand } from 'citty';
import { getLoadedContext } from '../project';
import { renderDependencyTree } from './dependency-tree';

export interface ListResult {
  milestones: string[];
  warnings: string[];
}

export async function list(_showTasks = false): Promise<ListResult> {
  const ctx = getLoadedContext();
  if (!ctx) {
    throw new Error('Project context not loaded');
  }
  return { milestones: ctx.milestones, warnings: ctx.warnings };
}

export async function runList(showTasks = false): Promise<void> {
  const result = await list(showTasks);
  const ctx = getLoadedContext();

  if (showTasks && ctx?.ir) {
    for (const milestoneId of result.milestones) {
      console.log(milestoneId);
      const tree = ctx.ir.getDependencyTree(milestoneId);
      const lines = renderDependencyTree(tree);
      for (const line of lines) {
        console.log(line);
      }
    }
  } else {
    for (const id of result.milestones) {
      console.log(id);
    }
  }
}

export const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all milestone IDs from .siren files',
  },
  args: {
    tasks: {
      type: 'boolean',
      alias: 't',
      description: 'Show incomplete tasks under each milestone',
    },
  },
  async run({ args }) {
    await runList(Boolean(args.tasks));
  },
});
