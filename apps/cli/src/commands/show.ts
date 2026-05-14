import { defineCommand } from 'citty';
import { surfaceDiagnostics } from '../lifecycle/presentation';
import { finalizeProject } from '../project';
import { renderDependencyTree } from './dependency-tree';

export async function runShow(entryId: string): Promise<void> {
  const ctx = await finalizeProject();
  surfaceDiagnostics(ctx);
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
      throw new Error('missing entry id — usage: siren show <entry-id>');
    }

    await runShow(entryId);
  },
});
