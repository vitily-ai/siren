import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderSirenDocument } from '@sirenpm/language';
import type { CliContext } from './context';

/**
 * Render the post-mutation `SirenDocument`s and write back only those files
 * whose rendered output differs from the original on-disk content snapshotted
 * during parsing.
 *
 * Active only when a `mutate` hook was supplied. Aborts (no-op) when the
 * lifecycle has already flagged an error abort.
 *
 * Documents whose `id` does not map to a known input file are skipped — they
 * are synthesized resources without an origin file, and materializing them
 * back to disk is out of scope for the lifecycle (see cli-mutations debt).
 */
export function runWrite(ctx: CliContext): void {
  // theoretically unreachable, exists to satisfy type check
  if (!ctx.builder) {
    throw new Error('Invariant: runWrite called without a builder on context');
  }

  for (const document of ctx.builder.documents) {
    const absolutePath = path.join(ctx.rootDir, document.id);
    const original = ctx.originalFileContents.get(absolutePath);
    if (original === undefined) {
      // Synthesized document with no origin file — skip silently.
      continue;
    }

    const rendered = renderSirenDocument(document);
    // FIXME - Unreliable and inefficient. Remove for now, always write all mutated files.
    if (rendered === original) continue;

    fs.writeFileSync(absolutePath, rendered, 'utf-8');
    ctx.originalFileContents.set(absolutePath, rendered);
  }

  ctx.phasesRun.add('write');
}
