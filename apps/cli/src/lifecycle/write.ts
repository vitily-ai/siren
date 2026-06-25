import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliContext, DeepReadonly } from './context';

export type WriteArtifact = {
  [k: keyof any]: unknown;
};

/**
 * Persist source-preserving edits back to disk using the rewrite signal.
 *
 * The rewrite signal (`ctx.rewriteSignal`) is a set of absolute file paths that
 * should be unconditionally rewritten. It is populated by the source-bridge
 * (for IR patch deltas) or the format lifecycle handler.
 *
 * dryRun mode skips actual writes but still reports what would change.
 * verbose mode logs each relative file path as it's written.
 */
export function runWrite(ctx: DeepReadonly<CliContext>): WriteArtifact {
  const { rewriteSignal, parsedDocuments, rootDir, sourceDocuments, dryRun, verbose } = ctx;

  const signalArray = [...rewriteSignal];
  const totalDocs = parsedDocuments.length;
  let written = 0;

  let dryRunOutput = '';

  for (const absolutePath of signalArray) {
    const relPath = path.relative(rootDir, absolutePath);
    const parsedDoc = parsedDocuments.find((p) => p.source.name === relPath);
    if (!parsedDoc) continue;

    const { content } = parsedDoc.source;

    if (dryRun) {
      // In dry-run mode, compare current content vs source document original
      const srcDoc = sourceDocuments.find((s) => s.name === relPath);
      if (srcDoc && srcDoc.content !== content) {
        dryRunOutput += `    Would update ${relPath}\n`;
        written++;
      }
    } else {
      fs.writeFileSync(absolutePath, content, 'utf-8');
      if (verbose) {
        console.log(relPath);
      }
      written++;
    }
  }

  if (dryRun && dryRunOutput.length > 0) {
    const dim = '\x1b[90m';
    const reset = '\x1b[0m';
    console.log(`${dim}Dry run results:\n${dryRunOutput.trimEnd()}${reset}`);
  }

  console.log(`Updated ${written} files out of ${totalDocs}`);

  return {};
}
