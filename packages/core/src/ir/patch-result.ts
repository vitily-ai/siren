import type { SirenBuilder } from './assembly';
import { getEphId } from './eph-id';
import type { SirenEntry } from './types';

export type ChangeMode = 'created' | 'updated' | 'deleted';

export interface EntryChange {
  entryId: string;
  mode: ChangeMode;
}

export interface PatchResult {
  builder: SirenBuilder;
  changes: readonly EntryChange[];
}

export function computeDelta(
  oldEntries: readonly SirenEntry[],
  newEntries: readonly SirenEntry[],
): readonly EntryChange[] {
  const changes: EntryChange[] = [];

  const oldEntryMap = new Map<string, SirenEntry[]>();
  for (const entry of oldEntries) {
    const bucket = oldEntryMap.get(entry.id);
    if (bucket) {
      bucket.push(entry);
    } else {
      oldEntryMap.set(entry.id, [entry]);
    }
  }

  const newEntryMap = new Map<string, SirenEntry[]>();
  for (const entry of newEntries) {
    const bucket = newEntryMap.get(entry.id);
    if (bucket) {
      bucket.push(entry);
    } else {
      newEntryMap.set(entry.id, [entry]);
    }
  }

  for (const [entryId, newEntryArray] of newEntryMap.entries()) {
    const oldEntryArray = oldEntryMap.get(entryId);
    if (!oldEntryArray || oldEntryArray.length === 0) {
      for (const _ of newEntryArray) {
        changes.push({ entryId, mode: 'created' });
      }
      continue;
    }

    const unmatchedNew: SirenEntry[] = [];
    for (const newEntry of newEntryArray) {
      const newEphId = getEphId(newEntry);
      const matchIndex = oldEntryArray.findIndex((entry) => getEphId(entry) === newEphId);
      if (matchIndex !== -1) {
        oldEntryArray.splice(matchIndex, 1);
      } else {
        unmatchedNew.push(newEntry);
      }
    }

    let matchedCount = 0;
    while (matchedCount < unmatchedNew.length && oldEntryArray.length > 0) {
      changes.push({ entryId, mode: 'updated' });
      oldEntryArray.shift();
      matchedCount += 1;
    }

    while (matchedCount < unmatchedNew.length) {
      changes.push({ entryId, mode: 'created' });
      matchedCount += 1;
    }
  }

  for (const oldEntryArray of oldEntryMap.values()) {
    for (const oldEntry of oldEntryArray) {
      changes.push({ entryId: oldEntry.id, mode: 'deleted' });
    }
  }

  return changes;
}
