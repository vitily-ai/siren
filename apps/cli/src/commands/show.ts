import { defineCommand } from 'citty';
import { getLoadedContext } from '../project';
import { renderDependencyTree } from './dependency-tree';

export async function runShow(entryId: string): Promise<void> {
  const ctx = getLoadedContext();
  if (!ctx) throw new Error('Project context not loaded');
  if (!ctx.ir) throw new Error('IR context not available');

  const tree = ctx.ir.getDependencyTree(entryId);

  console.log(entryId);

  const lines = renderDependencyTree(tree);
  for (const line of lines) {
    console.log(line);
  }
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
      console.error('missing entry id — usage: siren show <entry-id>');
      return;
    }

    try {
      await runShow(entryId);
    } catch (error) {
      console.error((error as Error).message);
    }
  },
});
