import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

test('emits WL002 for multiple status keywords; last keyword wins', async () => {
  const adapter = await getAdapter();
  const { resources, parseDiagnostics } = await parseAndDecodeAll(adapter, 'draft-multi-keyword');

  expect(resources).toHaveLength(1);
  // Decoder currently only recognizes 'complete' literally; last token is
  // 'complete' so status carries through.
  expect(resources[0]?.id).toBe('foo');
  expect(resources[0]?.status).toBe('complete');

  const wl002 = parseDiagnostics.filter((d) => d.code === 'WL002');
  expect(wl002).toHaveLength(1);
  expect(wl002[0]).toMatchObject({
    code: 'WL002',
    severity: 'warning',
    file: 'main.siren',
    message: "resource 'foo' has multiple status keywords; treated as 'complete'",
  });

  // No WL003 (winning token is a valid status).
  expect(parseDiagnostics.filter((d) => d.code === 'WL003')).toHaveLength(0);
});
