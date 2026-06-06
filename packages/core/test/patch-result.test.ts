import { describe, expect, it } from 'vitest';
import { SirenBuilder } from '../src/ir/assembly';
import { computeDelta, type EntryChange } from '../src/ir/patch-result';
import type { SirenEntry } from '../src/ir/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(id: string): SirenEntry {
  return { type: 'task', id, attributes: [] };
}

/**
 * Helper to generate reliably stamped old and new entry arrays for computeDelta,
 * mimicking what SirenBuilder.patch() does internally, allowing us to unit test
 * the pure computeDelta logic using real Eph-IDs.
 */
function getDelta(
  oldEntriesInput: SirenEntry[],
  patchFn: (entries: SirenEntry[]) => SirenEntry[],
): readonly EntryChange[] {
  const bOld = SirenBuilder.fromEntries(oldEntriesInput);
  const oldEntries = bOld.entries;
  const newEntriesInput = patchFn([...oldEntries]);
  const bNew = SirenBuilder.fromEntries(newEntriesInput);

  return computeDelta(oldEntries, bNew.entries);
}

// ---------------------------------------------------------------------------
// SirenEntry-level change modes
// ---------------------------------------------------------------------------

describe('computeDelta - entry change modes', () => {
  it('created: new entryId in an existing list appears as created', () => {
    const changes = getDelta([makeTask('t1')], (entries) => [...entries, makeTask('t2')]);

    expect(changes).toEqual<EntryChange[]>([{ entryId: 't2', mode: 'created' }]);
  });

  it('updated: spreading an existing entry with the same id loses eph-id and registers as updated', () => {
    const changes = getDelta([makeTask('t1')], (entries) => entries.map((entry) => ({ ...entry })));

    expect(changes).toEqual<EntryChange[]>([{ entryId: 't1', mode: 'updated' }]);
  });

  it('deleted: entry removed from the list appears as deleted', () => {
    const changes = getDelta([makeTask('t1'), makeTask('t2')], (entries) =>
      entries.filter((entry) => entry.id !== 't1'),
    );

    expect(changes).toEqual<EntryChange[]>([{ entryId: 't1', mode: 'deleted' }]);
  });

  it('preserves duplicate entries when computing changes', () => {
    const changes = getDelta([makeTask('dup'), makeTask('dup')], (entries) => [
      entries[0]!,
      { ...entries[1]!, status: 'complete' as const },
    ]);

    expect(changes).toEqual<EntryChange[]>([{ entryId: 'dup', mode: 'updated' }]);
  });

  it('correctly matches fresh duplicates inserted before existing ones by eph-id', () => {
    const changes = getDelta([makeTask('dup')], (entries) => [makeTask('dup'), entries[0]!]);

    expect(changes).toEqual<EntryChange[]>([{ entryId: 'dup', mode: 'created' }]);
  });

  it('detects a deleted duplicate entry when remaining copies decrease', () => {
    const changes = getDelta([makeTask('dup'), makeTask('dup')], (entries) => [entries[0]!]);

    expect(changes).toEqual<EntryChange[]>([{ entryId: 'dup', mode: 'deleted' }]);
  });
});

// ---------------------------------------------------------------------------
// Flat-list change modes
// ---------------------------------------------------------------------------

describe('computeDelta - flat-list change modes', () => {
  it('identical entry arrays produce no changes', () => {
    const changes = getDelta([makeTask('t1'), makeTask('t2')], (entries) => [
      entries[0]!,
      entries[1]!,
    ]);

    expect(changes).toEqual([]);
  });

  it('reordering entries within a flat list produces no change', () => {
    const changes = getDelta([makeTask('t1'), makeTask('t2')], (entries) => [...entries].reverse());

    expect(changes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Eph-id preservation
// ---------------------------------------------------------------------------

describe('computeDelta - eph-id preservation', () => {
  it('same frozen entry reference passed back is not classified as updated', () => {
    const changes = getDelta([makeTask('t1'), makeTask('t2')], (entries) => [
      entries[0]!,
      entries[1]!,
    ]);

    expect(changes).toEqual([]);
  });

  it('JSON round-trip: serialised entry loses eph-id and registers as updated', () => {
    const changes = getDelta([makeTask('t1')], (entries) => [
      JSON.parse(JSON.stringify(entries[0]!)) as SirenEntry,
    ]);

    expect(changes).toEqual<EntryChange[]>([{ entryId: 't1', mode: 'updated' }]);
  });
});
