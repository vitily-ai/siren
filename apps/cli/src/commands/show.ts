import type { SirenProject } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { type QueryArtifact, runLifecycle } from '../lifecycle';
import { renderDependencyTree } from './dependency-tree';

export function showQuery(entryId: string) {
  return (project: SirenProject): QueryArtifact => {
    const tree = project.getDependencyTree(entryId);
    return {
      stdout: [entryId, ...renderDependencyTree(tree)],
    };
  };
}

export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: "Show a single entry's dependency tree (milestone or task)",
  },
  args: {
    entryId: {
      type: 'positional',
      required: false,
      description: 'Entry ID',
    },
  },
  async run({ args }) {
    const entryId = args.entryId;
    if (typeof entryId !== 'string' || entryId.length === 0) {
      throw new Error('missing entry id — usage: siren show <entry-id>');
    }

    await runLifecycle(process.cwd(), { query: showQuery(entryId) });
  },
});
