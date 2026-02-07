import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

test('emits W005 for dangling dependencies and does not include missing nodes in IR graph', async () => {
  const adapter = await getAdapter();
  const { resources, diagnostics } = await parseAndDecodeAll(adapter, 'dangling-dependencies');

  const warnings = diagnostics.filter((d) => d.code === 'W005' && d.severity === 'warning');
  expect(warnings.length).toBe(3);

  // PRESCRIPTIVE: Core MUST provide structured diagnostic data
  // Diagnostics should have: code, severity, resourceId, resourceType, dependencyId, file

  // Find the specific diagnostic for with-dangling -> missing-task
  const danglingMissingTask = warnings.find(
    (w: any) => w.resourceId === 'with-dangling' && w.dependencyId === 'missing-task',
  );
  expect(danglingMissingTask).toBeDefined();
  expect(danglingMissingTask.code).toBe('W005');
  expect(danglingMissingTask.severity).toBe('warning');
  expect(danglingMissingTask.resourceId).toBe('with-dangling');
  expect(danglingMissingTask.resourceType).toBe('milestone');
  expect(danglingMissingTask.dependencyId).toBe('missing-task');
  expect(danglingMissingTask.file).toBe('siren/main.siren');  // PRESCRIPTIVE: Integration tests with real files MUST include position info
  expect(danglingMissingTask.line).toBeGreaterThan(0);
  expect(danglingMissingTask.column).toBeGreaterThanOrEqual(0);
  // Find diagnostics for with-two-dangling -> missing1 and missing2
  const danglingMissing1 = warnings.find(
    (w: any) => w.resourceId === 'with-two-dangling' && w.dependencyId === 'missing1',
  );
  expect(danglingMissing1).toBeDefined();
  expect(danglingMissing1.resourceId).toBe('with-two-dangling');
  expect(danglingMissing1.resourceType).toBe('milestone');
  expect(danglingMissing1.dependencyId).toBe('missing1');
  expect(danglingMissing1.file).toBe('siren/main.siren');  expect(danglingMissing1.line).toBeGreaterThan(0);
  expect(danglingMissing1.column).toBeGreaterThanOrEqual(0);
  const danglingMissing2 = warnings.find(
    (w: any) => w.resourceId === 'with-two-dangling' && w.dependencyId === 'missing2',
  );
  expect(danglingMissing2).toBeDefined();
  expect(danglingMissing2.resourceId).toBe('with-two-dangling');
  expect(danglingMissing2.resourceType).toBe('milestone');
  expect(danglingMissing2.dependencyId).toBe('missing2');
  expect(danglingMissing2.file).toBe('siren/main.siren');  expect(danglingMissing2.line).toBeGreaterThan(0);
  expect(danglingMissing2.column).toBeGreaterThanOrEqual(0);
  const ids = resources.map((r) => r.id);
  expect(ids).toContain('present');
  expect(ids).toContain('with-dangling');
  expect(ids).not.toContain('missing-task');
});
