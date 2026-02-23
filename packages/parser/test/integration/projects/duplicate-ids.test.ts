import type { Diagnostic, DuplicateIdDiagnostic } from '@siren/core';
import { parseSourceAddress } from '@siren/core';
import { expect, test } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

function isDuplicateIdDiagnostic(diagnostic: Diagnostic): diagnostic is DuplicateIdDiagnostic {
  return diagnostic.code === 'WC-003' && diagnostic.severity === 'warning';
}

test('emits WC-003 for duplicate IDs and keeps only first occurrence of each', async () => {
  const adapter = await getAdapter();
  const { resources, diagnostics } = await parseAndDecodeAll(adapter, 'duplicate-ids');

  // PRESCRIPTIVE: Only first occurrence of each duplicate ID is kept
  expect(resources).toHaveLength(3);
  const ids = resources.map((r) => r.id);
  expect(ids).toEqual(['duplicate-task', 'duplicate-milestone', 'unique-task']);

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

  // PRESCRIPTIVE: WC-003 diagnostics for dropped duplicates
  const duplicateWarnings = diagnostics.filter(isDuplicateIdDiagnostic);
  expect(duplicateWarnings).toHaveLength(3); // One for duplicate-task, two for duplicate-milestone

  // PRESCRIPTIVE: Check duplicate-task diagnostic
  const taskDuplicate = duplicateWarnings.find((w) => w.resourceId === 'duplicate-task');
  expect(taskDuplicate).toBeDefined();
  expect(taskDuplicate!.code).toBe('WC-003');
  expect(taskDuplicate!.severity).toBe('warning');
  expect(taskDuplicate!.resourceId).toBe('duplicate-task');
  expect(taskDuplicate!.resourceType).toBe('task');

  // PRESCRIPTIVE: source is the duplicate (dropped) occurrence, firstSource is the first (kept) occurrence
  const dupAddr = parseSourceAddress(taskDuplicate!.source);
  expect(dupAddr.file).toBe('duplicate-ids2.siren'); // Duplicate occurrence file
  expect(dupAddr.line).toBe(2); // Line in duplicate-ids2.siren
  expect(dupAddr.column).toBe(0);
  const firstAddr = parseSourceAddress(taskDuplicate!.firstSource);
  expect(firstAddr.line).toBe(3); // Line in duplicate-ids1.siren (after comments)
  expect(firstAddr.column).toBe(0);

  // PRESCRIPTIVE: Check duplicate-milestone diagnostics (two dropped occurrences)
  const milestoneDuplicates = duplicateWarnings.filter(
    (w) => w.resourceId === 'duplicate-milestone',
  );
  expect(milestoneDuplicates).toHaveLength(2); // Two dropped occurrences

  // PRESCRIPTIVE: Each diagnostic is attributed to the dropped (duplicate) occurrence file
  const milestoneDuplicateFiles = new Set(
    milestoneDuplicates.map((d) => parseSourceAddress(d.source).file),
  );
  expect(milestoneDuplicateFiles).toEqual(
    new Set(['duplicate-ids1.siren', 'duplicate-ids2.siren']),
  );

  for (const diag of milestoneDuplicates) {
    expect(diag.code).toBe('WC-003');
    expect(diag.severity).toBe('warning');
    expect(diag.resourceId).toBe('duplicate-milestone');
    expect(diag.resourceType).toBe('milestone');
    const firstSrcAddr = parseSourceAddress(diag.firstSource);
    expect(firstSrcAddr.line).toBeGreaterThan(0);
    expect(firstSrcAddr.column).toBeGreaterThanOrEqual(0);
    const dupSrcAddr = parseSourceAddress(diag.source);
    expect(dupSrcAddr.line).toBeGreaterThan(0);
    expect(dupSrcAddr.column).toBeGreaterThanOrEqual(0);
  }

  // PRESCRIPTIVE: No other warnings or errors (no dangling deps, no cycles)
  const otherDiagnostics = diagnostics.filter((d) => d.code !== 'WC-003');
  expect(otherDiagnostics).toHaveLength(0);
});
