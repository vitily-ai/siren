import * as fs from 'node:fs';
import * as path from 'node:path';
import { decode, exportToSiren, IRContext, type Resource } from '@siren/core';
import { getParser } from '../parser.js';
import { loadProject } from '../project.js';

export interface FormatOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

function resourcesEqual(a: readonly Resource[], b: readonly Resource[]): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_e) {
    return false;
  }
}

export async function runFormat(opts: FormatOptions = {}): Promise<void> {
  // Reload project context to ensure files are discovered in test envs
  const ctx = await loadProject(process.cwd());
  if (!ctx) throw new Error('Project context not loaded');
  const parser = await getParser();

  const totalFiles = ctx.files.length;
  const updatedFiles: string[] = [];
  const updatedFilesWouldEdit: string[] = [];

  for (const filePath of ctx.files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const parseResult = await parser.parse(source);
    if (!parseResult.tree) {
      console.error(`Skipping ${path.relative(process.cwd(), filePath)} (parse error)`);
      continue;
    }
    const decodeResult = decode(parseResult.tree);
    if (!decodeResult.document) {
      console.error(`Skipping ${path.relative(process.cwd(), filePath)} (decode failed)`);
      continue;
    }

    const perFileIR = IRContext.fromResources(decodeResult.document.resources, filePath);
    const exported = exportToSiren(perFileIR);

    // If exporter would drop all content (e.g. a file that only contains
    // comments) or the source contains comments that would be lost, prefer
    // to preserve the original source so comments are not discarded.
    let toWrite = exported;
    const sourceHasComments = /(^|\n)\s*(#|\/\/)\s*/.test(source);
    if (exported.trim() === '' && sourceHasComments) {
      toWrite = source;
    }

    // Validate round-trip: parse exported text and decode
    const parse2 = await parser.parse(toWrite);
    if (!parse2.tree) {
      console.error(`Format produced unparsable output for ${filePath}`);
      continue;
    }
    const decoded2 = decode(parse2.tree);
    if (!decoded2.document) {
      console.error(`Format produced undecodable output for ${filePath}`);
      continue;
    }

    if (!resourcesEqual(decodeResult.document.resources, decoded2.document.resources)) {
      console.error(`Format round-trip changed semantics for ${filePath}; skipping`);
      continue;
    }

    // If exported equals original source, do not write or count as updated.
    if (toWrite === source) {
      continue;
    }

    if (opts.dryRun) {
      // Preserve existing behavior: print exported content for dry-run
      console.log(toWrite);
      updatedFilesWouldEdit.push(path.relative(process.cwd(), filePath));
    } else {
      // Also print exported content when actually writing files so
      // golden tests capture the formatted output.
      console.log(toWrite);
      fs.writeFileSync(filePath, toWrite, 'utf-8');
      updatedFiles.push(path.relative(process.cwd(), filePath));
    }
  }
  // Print summary
  const updatedCount = opts.dryRun ? updatedFilesWouldEdit.length : updatedFiles.length;
  console.log(`Updated ${updatedCount} files out of ${totalFiles}`);
  if (opts.verbose) {
    const list = opts.dryRun ? updatedFilesWouldEdit : updatedFiles;
    for (const p of list) console.log(`- ${p}`);
  }
}
