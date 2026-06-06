import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

test('emits WL001 when status attribute is used without a status keyword', async () => {
  const adapter = await getAdapter();
  const { resources, parseDiagnostics } = await parseAndDecodeAll(
    adapter,
    'draft-status-attribute-only',
  );

  expect(resources).toHaveLength(1);
  expect(resources[0]?.id).toBe('foo');
  // Attribute form is not a supported authoring path; status remains undefined.
  expect(resources[0]?.status).toBeUndefined();
  expect(resources[0]?.attributes.find((a) => a.key === 'status')).toBeUndefined();

  const wl001 = parseDiagnostics.filter((d) => d.code === 'WL001');
  expect(wl001).toHaveLength(1);
  expect(wl001[0]).toMatchObject({
    code: 'WL001',
    severity: 'warning',
    file: 'main.siren',
    message:
      'resource \'foo\' uses attribute form status = "draft"; use the keyword form instead (e.g. `task foo draft {}`); attribute ignored',
  });
});
