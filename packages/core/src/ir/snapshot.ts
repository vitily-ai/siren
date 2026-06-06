import { klona } from 'klona';
import { EPH_ID, getEphId, stampEphId } from './eph-id';
import { SirenCoreError } from './errors';
import type { SirenEntry } from './types';

export function cloneEntries(
  entries: readonly SirenEntry[],
  seenEphIds: Set<string> = new Set(),
): readonly SirenEntry[] {
  return entries.map((r) => cloneEntry(r, seenEphIds));
}

function cloneEntry(entry: SirenEntry, seenEphIds: Set<string>): SirenEntry {
  const clone = klona(entry);

  const existingId = getEphId(entry);
  if (existingId !== undefined) {
    if (seenEphIds.has(existingId)) {
      // defensive check, as eph ids are internal and used for diff calculation
      throw new SirenCoreError(
        'Duplicate eph-id detected. Multiple entries share the same eph-id identity. This is unlikely to be user error.',
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

  return clone;
}
