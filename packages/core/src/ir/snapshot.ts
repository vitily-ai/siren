import {
  type Attribute,
  type AttributeValue,
  isArray,
  isReference,
  type Origin,
  type Resource,
} from './types';

export function cloneAndFreezeResources(resources: readonly Resource[]): readonly Resource[] {
  return Object.freeze(resources.map(cloneAndFreezeResource));
}

function cloneAndFreezeResource(resource: Resource): Resource {
  const clone: Resource = {
    type: resource.type,
    id: resource.id,
    complete: resource.complete,
    attributes: Object.freeze(resource.attributes.map(cloneAndFreezeAttribute)),
    ...(resource.origin ? { origin: cloneAndFreezeOrigin(resource.origin) } : {}),
  };

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
  const clone: Origin = {
    startByte: origin.startByte,
    endByte: origin.endByte,
    startRow: origin.startRow,
    endRow: origin.endRow,
    ...(origin.document !== undefined ? { document: origin.document } : {}),
  };

  return Object.freeze(clone);
}
