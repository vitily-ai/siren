import { describe, expect, it } from 'vitest';
import { cloneAndFreezeResources } from './snapshot';
import { isArray, isReference, type Resource } from './types';

describe('cloneAndFreezeResources', () => {
  it('returns a frozen wrapper array even for empty input', () => {
    const cloned = cloneAndFreezeResources([]);
    expect(cloned).toEqual([]);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it('preserves primitive attribute values verbatim and keeps the raw field', () => {
    const cloned = cloneAndFreezeResources([
      {
        type: 'task',
        id: 'a',
        complete: false,
        attributes: [
          { key: 'description', value: 'hello', raw: '"hello"' },
          { key: 'effort', value: 3 },
          { key: 'enabled', value: true },
          { key: 'placeholder', value: null },
        ],
      },
    ]);

    const cloneAttributes = cloned[0]?.attributes ?? [];
    expect(cloneAttributes.map((attribute) => [attribute.key, attribute.value])).toEqual([
      ['description', 'hello'],
      ['effort', 3],
      ['enabled', true],
      ['placeholder', null],
    ]);
    expect(cloneAttributes[0]?.raw).toBe('"hello"');
    expect(cloneAttributes[1]?.raw).toBeUndefined();
    cloneAttributes.forEach((attribute) => {
      expect(Object.isFrozen(attribute)).toBe(true);
    });
  });

  it('omits the origin property entirely when input has no origin', () => {
    const cloned = cloneAndFreezeResources([
      { type: 'task', id: 'a', complete: false, attributes: [] },
    ]);
    const resource = cloned[0];

    expect(resource).toBeDefined();
    expect(resource && 'origin' in resource).toBe(false);
  });

  it('clones nested arrays and references so inputs cannot mutate snapshot data', () => {
    const referenceElement = { kind: 'reference' as const, id: 'task-b' };
    const innerArray = {
      kind: 'array' as const,
      elements: [referenceElement],
    };
    const outerArray = {
      kind: 'array' as const,
      elements: [innerArray],
    };
    const sourceResource = {
      type: 'task' as const,
      id: 'task-a',
      complete: false,
      attributes: [{ key: 'depends_on', value: outerArray }],
    };

    const cloned = cloneAndFreezeResources([sourceResource]);
    const clonedAttribute = cloned[0]?.attributes[0];
    expect(clonedAttribute).toBeDefined();
    if (!clonedAttribute) throw new Error('expected attribute');

    const clonedOuter = clonedAttribute.value;
    expect(isArray(clonedOuter)).toBe(true);
    if (!isArray(clonedOuter)) throw new Error('expected outer array');

    const clonedInner = clonedOuter.elements[0];
    expect(clonedInner).toBeDefined();
    if (!clonedInner || !isArray(clonedInner)) throw new Error('expected inner array');

    const clonedReference = clonedInner.elements[0];
    expect(clonedReference).toBeDefined();
    if (!clonedReference || !isReference(clonedReference)) {
      throw new Error('expected reference');
    }

    expect(clonedOuter).not.toBe(outerArray);
    expect(clonedInner).not.toBe(innerArray);
    expect(clonedReference).not.toBe(referenceElement);
    expect(Object.isFrozen(clonedOuter)).toBe(true);
    expect(Object.isFrozen(clonedOuter.elements)).toBe(true);
    expect(Object.isFrozen(clonedInner)).toBe(true);
    expect(Object.isFrozen(clonedInner.elements)).toBe(true);
    expect(Object.isFrozen(clonedReference)).toBe(true);

    referenceElement.id = 'mutated';
    innerArray.elements.push({ kind: 'reference', id: 'late-add' });

    expect(clonedReference.id).toBe('task-b');
    expect(clonedInner.elements).toHaveLength(1);
  });

  it('freezes the origin clone independently from the input origin', () => {
    const sourceOrigin = {
      startByte: 0,
      endByte: 10,
      startRow: 2,
      endRow: 2,
      document: 'a.siren',
    };
    const sourceResource: Resource = {
      type: 'task',
      id: 'a',
      complete: false,
      attributes: [],
      origin: sourceOrigin,
    };

    const cloned = cloneAndFreezeResources([sourceResource]);
    const clonedOrigin = cloned[0]?.origin;
    expect(clonedOrigin).toBeDefined();
    if (!clonedOrigin) throw new Error('expected origin');

    expect(clonedOrigin).not.toBe(sourceOrigin);
    expect(clonedOrigin).toEqual(sourceOrigin);
    expect(Object.isFrozen(clonedOrigin)).toBe(true);
  });

  it('clones attribute origins independently and freezes them', () => {
    const attributeOrigin = {
      startByte: 0,
      endByte: 5,
      startRow: 1,
      endRow: 1,
      document: 'a.siren',
    };
    const cloned = cloneAndFreezeResources([
      {
        type: 'task',
        id: 'a',
        complete: false,
        attributes: [{ key: 'description', value: 'x', origin: attributeOrigin }],
      },
    ]);

    const clonedAttribute = cloned[0]?.attributes[0];
    expect(clonedAttribute?.origin).toBeDefined();
    expect(clonedAttribute?.origin).not.toBe(attributeOrigin);
    expect(Object.isFrozen(clonedAttribute?.origin)).toBe(true);
  });
});
