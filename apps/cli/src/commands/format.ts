import * as fs from 'node:fs';
import * as path from 'node:path';
import { decode, IRContext, type Resource } from '@siren/core';
import { exportToSiren } from '../../../../packages/core/src/export/index.js';
import { getParser } from '../parser.js';
import { loadProject } from '../project.js';

export interface FormatOptions {
  dryRun?: boolean;
  backup?: boolean;
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

    // Validate round-trip: parse exported text and decode
    const parse2 = await parser.parse(exported);
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

    if (opts.dryRun) {
      console.log(exported);
    } else {
      if (opts.backup) {
        fs.writeFileSync(`${filePath}.bak`, source, 'utf-8');
      }
      fs.writeFileSync(filePath, exported, 'utf-8');
      console.log(`Wrote ${path.relative(process.cwd(), filePath)}`);
    }
  }
}
