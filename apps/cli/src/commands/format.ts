import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SirenEntry } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { runLifecycle } from '../lifecycle';
import { getParser } from '../parser';

// NOTE: TODO[FORMAT-LIFECYCLE-BYPASS]
// `format` is an intentional exception to the runLifecycle({mutate, query})
// inversion: it operates per-file on the language `ParsedDocument` (whose
// `format()` is CST-backed and comment-preserving), not on the semantic
// `SirenProject` model the rest of the lifecycle is built around. It therefore
// consumes only the discovery artefact (`ctx.files`) and performs its own
// per-file parse + format + round-trip validation + write.

export interface FormatOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Reduce entries to a semantic key, ignoring language-owned `origin` metadata
 * (present on `SourcedEntry`/`SourcedAttribute`) so a format round-trip can be
 * checked for semantic preservation.
 */
// FIXME figure out what problem this solves? Entry id or origin should be good enough.
function semanticKey(entries: readonly SirenEntry[]): string {
  const stripped = entries.map((entry) => ({
    type: entry.type,
    id: entry.id,
    status: entry.status,
    attributes: entry.attributes.map((attr) => ({ key: attr.key, value: attr.value })),
  }));
  return JSON.stringify(stripped);
}

export async function runFormat(opts: FormatOptions = {}): Promise<void> {
  // Run the lifecycle to perform discovery, parsing, build, and diagnostics
  // presentation. We discard the returned project (format doesn't operate on
  // it) and consume only `ctx.files` for the per-file work below.
  const ctx = await runLifecycle(process.cwd());

  const parser = await getParser();

  const totalFiles = ctx.files.length;
  const updatedFiles: string[] = [];
  const updatedFilesWouldEdit: string[] = [];

  async function processFile(filePath: string) {
    const result = { filePath, updated: false, wouldEdit: false };
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(process.cwd(), filePath);
      const parsed = await parser.parse({ name: relPath, content: source });

      if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        // FIXME this is no longer the case
        // language now removes only affected entries, not the whole document
        console.error(`Skipping ${relPath} (parse error)`);
        return result;
      }

      // Capture the decoded semantics before format() mutates the document.
      const beforeKey = semanticKey(parsed.toEntries());
      const toWrite = parsed.format();

      // format() re-parses canonical output; a regression there would surface
      // as new error diagnostics.
      if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        // FIXME this needs to be a defensive language error, not a cli check
        console.error(`Format produced unparsable output for ${filePath}`);
        return result;
      }

      if (beforeKey !== semanticKey(parsed.toEntries())) {
        console.error(`Format round-trip changed semantics for ${filePath}; skipping`);
        return result;
      }

      // If formatted output equals original source, do not write or count as updated.
      if (toWrite === source) {
        return result;
      }

      if (opts.dryRun) {
        // Preserve existing behavior: print exported content for dry-run
        const toPrint = toWrite.endsWith('\n') ? toWrite : `${toWrite}\n`;
        console.log(toPrint);
        result.wouldEdit = true;
        return result;
      }

      // TODO[RUNFORMAT-ATOMIC]
      // Currently the formatter writes files with `fs.writeFileSync` which is
      // not atomic and has no backup or rollback semantics. See task
      // `runformat-atomic-backup` in siren/debt.siren.
      fs.writeFileSync(filePath, toWrite, 'utf-8');
      result.updated = true;
      return result;
    } catch (e) {
      console.error(`Error formatting ${filePath}: ${(e as Error).message}`);
      return result;
    }
  }

  const results = await Promise.all(ctx.files.map((f) => processFile(f)));
  for (const r of results) {
    if (r.updated) updatedFiles.push(path.relative(process.cwd(), r.filePath));
    if (r.wouldEdit) updatedFilesWouldEdit.push(path.relative(process.cwd(), r.filePath));
  }
  // Print summary
  const updatedCount = opts.dryRun ? updatedFilesWouldEdit.length : updatedFiles.length;
  console.log(`Updated ${updatedCount} files out of ${totalFiles}`);
  if (opts.verbose) {
    const list = opts.dryRun ? updatedFilesWouldEdit : updatedFiles;
    for (const p of list) console.log(`- ${p}`);
  }
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
