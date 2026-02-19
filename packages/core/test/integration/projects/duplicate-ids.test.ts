import { expect, test } from 'vitest';
import type { Diagnostic, DuplicateIdDiagnostic } from '../../../src/ir/context.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

function isDuplicateIdDiagnostic(diagnostic: Diagnostic): diagnostic is DuplicateIdDiagnostic {
  return diagnostic.code === 'W006' && diagnostic.severity === 'warning';
}

test('emits W006 for duplicate IDs and keeps only first occurrence of each', async () => {
  const adapter = await getAdapter();
  const { resources, diagnostics } = await parseAndDecodeAll(adapter, 'duplicate-ids');

  // PRESCRIPTIVE: Only first occurrence of each duplicate ID is kept
  // +2 synthetic per-file milestones (duplicate-ids1, duplicate-ids2)
  expect(resources).toHaveLength(5);
  const ids = resources.map((r) => r.id);
  expect(ids.slice(0, 3)).toEqual(['duplicate-task', 'duplicate-milestone', 'unique-task']);
  expect(new Set(ids.slice(3))).toEqual(new Set(['duplicate-ids1', 'duplicate-ids2']));

  // PRESCRIPTIVE: First occurrences should have correct attributes
  const firstTask = resources.find((r) => r.id === 'duplicate-task');
  expect(firstTask).toBeDefined();
  expect(firstTask!.type).toBe('task');
  expect(firstTask!.attributes.find((a) => a.key === 'description')?.value).toBe(
    'First occurrence - this one is kept',
  );

  const firstMilestone = resources.find((r) => r.id === 'duplicate-milestone');
  expect(firstMilestone).toBeDefined();
  expect(firstMilestone!.type).toBe('milestone');
  expect(firstMilestone!.attributes.find((a) => a.key === 'description')?.value).toBe(
    'First milestone occurrence',
  );

  // PRESCRIPTIVE: W006 diagnostics for dropped duplicates
  const duplicateWarnings = diagnostics.filter(isDuplicateIdDiagnostic);
  expect(duplicateWarnings).toHaveLength(3); // One for duplicate-task, two for duplicate-milestone

  // PRESCRIPTIVE: Check duplicate-task diagnostic
  const taskDuplicate = duplicateWarnings.find((w) => w.resourceId === 'duplicate-task');
  expect(taskDuplicate).toBeDefined();
  expect(taskDuplicate!.code).toBe('W006');
  expect(taskDuplicate!.severity).toBe('warning');
  expect(taskDuplicate!.resourceId).toBe('duplicate-task');
  expect(taskDuplicate!.resourceType).toBe('task');

  // PRESCRIPTIVE: File attribution from duplicate occurrence, line positions for both
  expect(taskDuplicate!.file).toBe('duplicate-ids2.siren'); // Duplicate occurrence file
  expect(taskDuplicate!.secondLine).toBe(2); // Line in duplicate-ids2.siren
  expect(taskDuplicate!.secondColumn).toBe(0);
  expect(taskDuplicate!.firstLine).toBe(3); // Line in duplicate-ids1.siren (after comments)
  expect(taskDuplicate!.firstColumn).toBe(0);

  // PRESCRIPTIVE: Check duplicate-milestone diagnostics (two dropped occurrences)
  const milestoneDuplicates = duplicateWarnings.filter(
    (w) => w.resourceId === 'duplicate-milestone',
  );
  expect(milestoneDuplicates).toHaveLength(2); // Two dropped occurrences

  // PRESCRIPTIVE: Each diagnostic is attributed to the dropped (duplicate) occurrence file
  const milestoneDuplicateFiles = new Set(milestoneDuplicates.map((d) => d.file));
  expect(milestoneDuplicateFiles).toEqual(
    new Set(['duplicate-ids1.siren', 'duplicate-ids2.siren']),
  );

  for (const diag of milestoneDuplicates) {
    expect(diag.code).toBe('W006');
    expect(diag.severity).toBe('warning');
    expect(diag.resourceId).toBe('duplicate-milestone');
    expect(diag.resourceType).toBe('milestone');
    expect(diag.firstLine).toBeGreaterThan(0);
    expect(diag.firstColumn).toBeGreaterThanOrEqual(0);
    expect(diag.secondLine).toBeGreaterThan(0);
    expect(diag.secondColumn).toBeGreaterThanOrEqual(0);
  }

  // PRESCRIPTIVE: No other warnings or errors (no dangling deps, no cycles)
  const otherDiagnostics = diagnostics.filter((d) => d.code !== 'W006');
  expect(otherDiagnostics).toHaveLength(0);
});
