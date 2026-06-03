/**
 * TEST BOUNDARY:
 * This module is exclusively for testing the `SirenBuilder` mutation APIs and
 * delta computations (`.patch()`, `withEntry()`, etc.).
 *
 * Construction, compilation (`.build()`), diagnostics generation, and initial
 * ephemeral identity stamping concerns belong in `assembly.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { type EntryChange, type PatchResult, SirenBuilder, type SirenEntry } from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(id: string): SirenEntry {
  return { type: 'task', id, attributes: [] };
}

// ---------------------------------------------------------------------------
// patch() — core delta semantics
// ---------------------------------------------------------------------------

describe('SirenBuilder.patch() returns PatchResult', () => {
  it('result has builder and changes properties', () => {
    const b = SirenBuilder.fromEntries([makeTask('t1')]);
    const result: PatchResult = b.patch((entries) => entries);
    expect(result).toHaveProperty('builder');
    expect(result).toHaveProperty('changes');
    expect(result.builder).toBeInstanceOf(SirenBuilder);
    expect(Array.isArray(result.changes)).toBe(true);
  });

  it('no-op patch: changes is empty and builder is a fresh instance', () => {
    const b = SirenBuilder.fromEntries([makeTask('t1')]);
    const result = b.patch((entries) => entries);
    expect(result.changes).toEqual([]);
    expect(result.builder).not.toBe(b);
    expect(result.builder.entries).toEqual(b.entries);
  });
});

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

describe('convenience wrappers', () => {
  it('withEntry: created change for the new entry', () => {
    const b = SirenBuilder.fromEntries([]);
    const result: PatchResult = b.withEntry(makeTask('t1'));

    expect(result).toHaveProperty('builder');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual<EntryChange>({ entryId: 't1', mode: 'created' });

    expect(result.builder.entries).toHaveLength(1);
    expect(result.builder.entries[0]!.id).toBe('t1');
  });

  it('withEntry appends new entries in order', () => {
    const b = SirenBuilder.fromEntries([]);
    const created = b.withEntry(makeTask('t1'));
    const patched = created.builder.withEntry(makeTask('t2'));

    expect(created.builder.entries.map((entry) => entry.id)).toEqual(['t1']);
    expect(patched.changes).toEqual<EntryChange[]>([{ entryId: 't2', mode: 'created' }]);
    expect(patched.builder.entries.map((entry) => entry.id)).toEqual(['t1', 't2']);
  });

  it('patchEntry: updated change for the patched entry', () => {
    const b = SirenBuilder.fromEntries([makeTask('t1')]);
    const result: PatchResult = b.patchEntry('t1', (r) => ({
      ...r,
      status: 'complete' as const,
    }));

    expect(result).toHaveProperty('builder');
    expect(result.changes).toEqual<EntryChange[]>([{ entryId: 't1', mode: 'updated' }]);

    const updatedEntry = result.builder.entries[0]!;
    expect(updatedEntry).toMatchObject({ id: 't1', status: 'complete' });
  });
});
