import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('emits WL003 for unknown status keyword and drops the status', async () => {
  const adapter = await getAdapter();
  const { resources, parseDiagnostics } = await parseAndDecodeAll(adapter, 'draft-unknown-keyword');

  expect(resources).toHaveLength(1);
  expect(resources[0]?.id).toBe('foo');
  expect(resources[0]?.status).toBeUndefined();

  const wl003 = parseDiagnostics.filter((d) => d.code === 'WL003');
  expect(wl003).toHaveLength(1);
  expect(wl003[0]).toMatchObject({
    code: 'WL003',
    severity: 'warning',
    file: 'main.siren',
    message: "unknown status keyword 'bogus' on resource 'foo'; status will be ignored",
  });
});

test('lint pass drops SyntaxResource.statusKeyword for unknown keyword', async () => {
  const adapter = await getAdapter();
  const fixturePath = join(
    __dirname,
    '..',
    '..',
    'fixtures',
    'projects',
    'draft-unknown-keyword',
    'main.siren',
  );
  const content = readFileSync(fixturePath, 'utf-8');

  const result = await adapter.parse([{ name: 'main.siren', content }]);
  const syntaxDocument = result.syntaxDocuments?.[0];
  expect(syntaxDocument).toBeDefined();
  if (!syntaxDocument) throw new Error('expected syntax document');

  const resource = syntaxDocument.resources[0];
  expect(resource).toBeDefined();
  if (!resource) throw new Error('expected resource');

  // The raw token list still carries the authored 'bogus' token.
  expect(resource.statusKeywords).toHaveLength(1);
  expect(resource.statusKeywords[0]?.raw).toBe('bogus');

  // The collapsed/validated single-token surface is undefined.
  expect(resource.statusKeyword).toBeUndefined();
});
