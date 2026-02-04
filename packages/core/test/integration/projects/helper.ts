import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IRContext } from '../../../src/ir/context.js';
import { getTestAdapter } from '../../helpers/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

export async function getAdapter() {
  return getTestAdapter();
}

export async function parseAndDecodeAll(adapter: any, projectName: string) {
  // Treat the fixture root as the project root; do not expect a nested `siren/` dir.
  const projectPath = join(projectsDir, projectName);
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
    const ir = IRContext.fromCst(parseResult.tree!);
    aggregatedResources.push(...ir.resources);
    diagnostics.push(...ir.diagnostics);
  }

  return { resources: aggregatedResources, diagnostics };
}
