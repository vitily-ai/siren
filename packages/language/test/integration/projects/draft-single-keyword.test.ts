import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('round-trips single draft status keyword without diagnostics', async () => {
  const adapter = await getAdapter();
  const { resources, diagnostics, parseDiagnostics } = await parseAndDecodeAll(
    adapter,
    'draft-single-keyword',
  );

  expect(resources).toHaveLength(3);
  for (const resource of resources) {
    expect(resource.status).toBe('draft');
  }

  // No parse-phase diagnostics (no WL001/WL002/WL003).
  expect(parseDiagnostics).toEqual([]);

  // No semantic diagnostics either.
  expect(diagnostics).toEqual([]);
});

test('syntax-level statusKeyword.raw is "draft" for single-keyword resources', async () => {
  const adapter = await getAdapter();
  const fixturePath = join(
    __dirname,
    '..',
    '..',
    'fixtures',
    'projects',
    'draft-single-keyword',
    'main.siren',
  );
  const content = readFileSync(fixturePath, 'utf-8');

  const result = await adapter.parse([{ name: 'main.siren', content }]);
  const syntaxDocument = result.syntaxDocuments?.[0];
  expect(syntaxDocument).toBeDefined();
  if (!syntaxDocument) throw new Error('expected syntax document');

  expect(syntaxDocument.resources).toHaveLength(3);
  for (const resource of syntaxDocument.resources) {
    expect(resource.statusKeywords).toHaveLength(1);
    expect(resource.statusKeyword?.raw).toBe('draft');
  }
});
