import { EPH_ID, getEphId, stampEphId } from './eph-id';
import { SirenCoreError } from './errors';
import {
  type Atom,
  type Attribute,
  isReference,
  type Origin,
  type Resource,
  type Tuple,
} from './types';

export function cloneAndFreezeResources(
  resources: readonly Resource[],
  seenEphIds: Set<string> = new Set(),
): readonly Resource[] {
  return Object.freeze(resources.map((r) => cloneAndFreezeResource(r, seenEphIds)));
}

function cloneAndFreezeResource(resource: Resource, seenEphIds: Set<string>): Resource {
  const clone: Resource = {
    type: resource.type,
    id: resource.id,
    ...(resource.status !== undefined ? { status: resource.status } : {}),
    attributes: Object.freeze(resource.attributes.map(cloneAndFreezeAttribute)),
    ...(resource.origin ? { origin: cloneAndFreezeOrigin(resource.origin) } : {}),
  };

  const existingId = getEphId(resource);
  if (existingId !== undefined) {
    if (seenEphIds.has(existingId)) {
      // defensive check, as eph ids are internal and used for diff calculation
      throw new SirenCoreError(
        'Duplicate eph-id detected. Multiple resources share the same eph-id identity across document slots. This is unlikely to be user error.',
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
