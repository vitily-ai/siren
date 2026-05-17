import { EPH_ID, getEphId, stampEphId } from './eph-id';
import { SirenCoreError } from './errors';
import {
  type Attribute,
  type AttributeValue,
  isArray,
  isReference,
  type Origin,
  type Resource,
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
        'Duplicate eph-id detected. The same resource object reference appears in multiple document slots. This is unlikely to be user error.',
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
    value: cloneAndFreezeAttributeValue(attribute.value),
    ...(attribute.raw !== undefined ? { raw: attribute.raw } : {}),
    ...(attribute.origin ? { origin: cloneAndFreezeOrigin(attribute.origin) } : {}),
  };

  return Object.freeze(clone);
}

function cloneAndFreezeAttributeValue(value: AttributeValue): AttributeValue {
  if (isArray(value)) {
    return Object.freeze({
      kind: 'array',
      elements: Object.freeze(value.elements.map(cloneAndFreezeAttributeValue)),
    });
  }

  if (isReference(value)) {
    return Object.freeze({ kind: 'reference', id: value.id });
  }

  return value;
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
