import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'path';
import { decode } from '../../../src/decoder/index.js';
import { getTestAdapter } from '../../helpers/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

export async function getAdapter() {
  return getTestAdapter();
}

export async function parseAndDecodeAll(adapter: any, projectName: string) {
  const projectPath = join(projectsDir, projectName, 'siren');
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith('.siren')) files.push(p);
    }
  }

  walk(projectPath);

  const aggregatedResources: any[] = [];
  const diagnostics: any[] = [];

  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    const parseResult = await adapter.parse(src);
    const decodeResult = decode(parseResult.tree!);
    if (decodeResult.document && decodeResult.document.resources) {
      aggregatedResources.push(...decodeResult.document.resources);
    }
    if (decodeResult.diagnostics) diagnostics.push(...decodeResult.diagnostics);
  }

  return { resources: aggregatedResources, diagnostics };
}
