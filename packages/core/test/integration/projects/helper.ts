import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IRContext } from '../../../src/ir/context.js';
import type { SourceDocument } from '../../../src/parser/adapter.js';
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

  // Build SourceDocument array from all files
  const documents: SourceDocument[] = files.map((f) => {
    const content = readFileSync(f, 'utf-8');
    // Compute relative path from project root for file attribution
    const name = f.substring(projectPath.length + 1);
    return { name, content };
  });

  // Parse all documents at once - multi-document API handles file attribution
  const parseResult = await adapter.parse(documents);
  const ir = IRContext.fromCst(parseResult.tree!);

  return { resources: ir.resources, diagnostics: ir.diagnostics };
}
