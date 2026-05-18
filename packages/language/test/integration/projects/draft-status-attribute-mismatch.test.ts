import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

test('emits WL001 when status keyword and status attribute differ; keyword wins', async () => {
  const adapter = await getAdapter();
  const { resources, parseDiagnostics } = await parseAndDecodeAll(
    adapter,
    'draft-status-attribute-mismatch',
  );

  expect(resources).toHaveLength(1);
  expect(resources[0]?.id).toBe('foo');
  expect(resources[0]?.status).toBe('draft');
  // status attribute dropped from IR
  expect(resources[0]?.attributes.find((a) => a.key === 'status')).toBeUndefined();

  const wl001 = parseDiagnostics.filter((d) => d.code === 'WL001');
  expect(wl001).toHaveLength(1);
  expect(wl001[0]).toMatchObject({
    code: 'WL001',
    severity: 'warning',
    file: 'main.siren',
    message:
      "resource 'foo' declares status keyword 'draft' but also has attribute status = \"complete\"; keyword wins, attribute ignored",
  });
});
