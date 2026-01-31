import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../../../src/decoder/index.js';
import { getTestAdapter } from '../../helpers/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

export async function getAdapter() {
  return getTestAdapter();
}

export async function parseAndDecodeAll(adapter: any, projectName: string) {
  // Support fixtures that either place .siren files under a nested `siren/`
  // directory (legacy) or directly under the fixture root.
  const nestedPath = join(projectsDir, projectName, 'siren');
  let projectPath = nestedPath;
  try {
    const entries = readdirSync(nestedPath, { withFileTypes: true });
    if (entries.length) {
      // If nested contains one or more non-empty .siren files, use it. Otherwise
      // fall back to fixture root.
      const hasNonEmpty = entries.some(
        (e) =>
          e.isFile() &&
          e.name.endsWith('.siren') &&
          readFileSync(join(nestedPath, e.name), 'utf-8').trim().length > 0,
      );
      if (!hasNonEmpty) projectPath = join(projectsDir, projectName);
    } else {
      projectPath = join(projectsDir, projectName);
    }
  } catch {
    projectPath = join(projectsDir, projectName);
  }
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
    if (decodeResult.document?.resources) {
      aggregatedResources.push(...decodeResult.document.resources);
    }
    if (decodeResult.diagnostics) diagnostics.push(...decodeResult.diagnostics);
  }

  return { resources: aggregatedResources, diagnostics };
}
