import type { PatchResult, SirenBuilder } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { runLifecycle } from '../lifecycle';

export type MvTarget = 'complete' | 'draft' | undefined;

/**
 * Factory: returns a mutate hook that sets an entry's explicit status.
 *
 * Searches builder.entries for the entry id. Throws if not found or if
 * the only match is a synthetic-origin entry (materialization deferred).
 *
 * Idempotent: if the entry already has the target status, returns an
 * identity transform (preserving eph-ids) so the delta reports zero changes.
 */
export function mvMutate(
  entryId: string,
  target: MvTarget,
): (builder: SirenBuilder) => PatchResult {
  return (builder: SirenBuilder): PatchResult => {
    const entries = builder.entries;
    const nonSynthetic = entries.filter(
      (e) => e.id === entryId && !('origin' in e && (e as any).origin?.kind === 'synthetic'),
    );
    const syntheticOnly =
      entries.filter((e) => e.id === entryId).length > 0 && nonSynthetic.length === 0;

    if (nonSynthetic.length === 0) {
      if (syntheticOnly) {
        throw new Error(
          `Entry "${entryId}" is synthesized — materialization not yet supported. ` +
            'Use an explicit milestone declaration instead.',
        );
      }
      throw new Error(`Entry "${entryId}" not found`);
    }

    // Idempotent guard: if status already matches, return identity patch
    const current = nonSynthetic[0];
    if (current?.status === target) {
      return builder.patch((entries) => entries);
    }

    return builder.patchEntry(entryId, (entry) => ({
      ...entry,
      status: target,
    }));
  };
}

export const mvCommand = defineCommand({
  meta: {
    name: 'mv',
    description: "Change an entry's explicit completion status",
  },
  args: {
    entryId: {
      type: 'positional',
      description: 'Entry ID to target',
      required: true,
    },
    target: {
      type: 'positional',
      description: "'complete' or 'draft'",
      required: true,
    },
    dryRun: {
      type: 'boolean',
      description: 'Print what would change without writing files',
      default: false,
    },
  },
  async run({ args }) {
    const entryId = String(args.entryId);
    const targetRaw = String(args.target);

    if (targetRaw !== 'complete' && targetRaw !== 'draft') {
      console.error(`Invalid target: "${targetRaw}". Must be "complete" or "draft".`);
      process.exitCode = 1;
      return;
    }

    await runLifecycle(process.cwd(), {
      mutate: mvMutate(entryId, targetRaw as 'complete' | 'draft'),
      dryRun: args.dryRun,
    });
  },
});
