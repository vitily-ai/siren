import { EPH_ID, getEphId, stampEphId } from './eph-id';
import { SirenCoreError } from './errors';
import {
  type Atom,
  type Attribute,
  isReference,
  type Origin,
  type SirenEntry,
  type Tuple,
} from './types';

export function cloneAndFreezeEntries(
  entries: readonly SirenEntry[],
  seenEphIds: Set<string> = new Set(),
): readonly SirenEntry[] {
  return Object.freeze(entries.map((r) => cloneAndFreezeEntry(r, seenEphIds)));
}

function cloneAndFreezeEntry(entry: SirenEntry, seenEphIds: Set<string>): SirenEntry {
  const clone: SirenEntry = {
    type: entry.type,
    id: entry.id,
    ...(entry.status !== undefined ? { status: entry.status } : {}),
    attributes: Object.freeze(entry.attributes.map(cloneAndFreezeAttribute)),
    ...(entry.origin ? { origin: cloneAndFreezeOrigin(entry.origin) } : {}),
  };

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

  return Object.freeze(clone);
}

function cloneAndFreezeAttribute(attribute: Attribute): Attribute {
  const clone: Attribute = {
    key: attribute.key,
    value: cloneAndFreezeTuple(attribute.value),
    ...(attribute.origin ? { origin: cloneAndFreezeOrigin(attribute.origin) } : {}),
  };

  return Object.freeze(clone);
}

function cloneAndFreezeTuple(tuple: Tuple): Tuple {
  return Object.freeze(tuple.map(cloneAndFreezeAtom));
}

function cloneAndFreezeAtom(atom: Atom): Atom {
  if (isReference(atom)) {
    return Object.freeze({ kind: 'reference', id: atom.id });
  }
  return atom;
}

function cloneAndFreezeOrigin(origin: Origin): Origin {
  if (origin.kind === 'synthetic') {
    return Object.freeze({
      kind: 'synthetic',
      document: origin.document,
    });
  }

  const clone: Origin = {
    kind: 'range',
    startByte: origin.startByte,
    endByte: origin.endByte,
    startRow: origin.startRow,
    endRow: origin.endRow,
    ...(origin.document !== undefined ? { document: origin.document } : {}),
  };

  return Object.freeze(clone);
}
