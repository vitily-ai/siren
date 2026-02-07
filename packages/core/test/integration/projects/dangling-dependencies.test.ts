import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

test('emits W005 for dangling dependencies and does not include missing nodes in IR graph', async () => {
  const adapter = await getAdapter();
  const { resources, diagnostics } = await parseAndDecodeAll(adapter, 'dangling-dependencies');

  const warnings = diagnostics.filter((d) => d.code === 'W005' && d.severity === 'warning');
  expect(warnings.length).toBe(3);
  expect(warnings[0].message).toContain(
    "Dangling dependency: milestone 'with-dangling' -> missing-task?",
  );

  const ids = resources.map((r) => r.id);
  expect(ids).toContain('present');
  expect(ids).toContain('with-dangling');
  expect(ids).not.toContain('missing-task');
});
