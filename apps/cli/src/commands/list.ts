import type { SirenProject } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { type QueryArtifact, runLifecycle } from '../lifecycle';
import { renderDependencyTree } from './dependency-tree';

function renderListLines(project: SirenProject, showTasks: boolean): string[] {
  const milestoneIds = project.getMilestoneIds();
  if (!showTasks) return [...milestoneIds];

  const lines: string[] = [];
  for (const milestoneId of milestoneIds) {
    lines.push(milestoneId);
    const tree = project.getDependencyTree(milestoneId);
    lines.push(...renderDependencyTree(tree));
  }
  return lines;
}

export function listQuery(showTasks: boolean) {
  return (project: SirenProject): QueryArtifact => ({
    stdout: renderListLines(project, showTasks),
  });
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
    await runLifecycle(process.cwd(), { query: listQuery(Boolean(args.tasks)) });
  },
});
