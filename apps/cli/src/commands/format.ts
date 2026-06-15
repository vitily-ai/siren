import { defineCommand } from 'citty';
import { runLifecycle } from '../lifecycle';

export interface FormatOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function runFormat(opts: FormatOptions = {}): Promise<void> {
  await runLifecycle(process.cwd(), {
    format: true,
    dryRun: opts.dryRun,
    verbose: opts.verbose,
  });
}

export const formatCommand = defineCommand({
  meta: {
    name: 'format',
    description: 'Format .siren files in-place or print formatted output',
  },
  args: {
    dryRun: {
      type: 'boolean',
      description: 'Print formatted output to stdout without writing files',
    },
    verbose: {
      type: 'boolean',
      description: 'Print list of files that would be updated or were updated',
    },
  },
  async run({ args }) {
    await runFormat({ dryRun: Boolean(args.dryRun), verbose: Boolean(args.verbose) });
  },
});
