import { deepFreeze } from 'deep-freeze-es6';
import { klona } from 'klona';
import { EPH_ID, getEphId, stampEphId } from './eph-id';
import { SirenCoreError } from './errors';
import type { SirenEntry } from './types';

export function cloneAndFreezeEntries(
  entries: readonly SirenEntry[],
  seenEphIds: Set<string> = new Set(),
): readonly SirenEntry[] {
  return Object.freeze(entries.map((r) => cloneAndFreezeEntry(r, seenEphIds)));
}

function cloneAndFreezeEntry(entry: SirenEntry, seenEphIds: Set<string>): SirenEntry {
  const clone = klona(entry);

  const existingId = getEphId(entry);
  if (existingId !== undefined) {
    if (seenEphIds.has(existingId)) {
      // defensive check, as eph ids are internal and used for diff calculation
      throw new SirenCoreError(
        'Duplicate eph-id detected. Multiple entries share the same eph-id identity across document slots. This is unlikely to be user error.',
      );
    }
    seenEphIds.add(existingId);
    Object.defineProperty(clone, EPH_ID, {
      value: existingId,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } else {
    stampEphId(clone);
    seenEphIds.add(getEphId(clone)!);
  }

  return deepFreeze(clone);
}
