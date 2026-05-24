import { describe, expect, it } from 'vitest';
import { cloneAndFreezeResources } from './snapshot';
import { isReference, type Resource } from './types';

describe('cloneAndFreezeResources', () => {
  it('returns a frozen wrapper array even for empty input', () => {
    const cloned = cloneAndFreezeResources([]);
    expect(cloned).toEqual([]);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it('preserves primitive attribute values as single-element tuples and exposes no raw field', () => {
    const cloned = cloneAndFreezeResources([
      {
        type: 'task',
        id: 'a',
        status: 'draft',
        attributes: [
          { key: 'description', value: ['hello'] },
          { key: 'effort', value: [3] },
          { key: 'enabled', value: [true] },
          { key: 'placeholder', value: [] },
        ],
      },
    ]);

    const cloneAttributes = cloned[0]?.attributes ?? [];
    expect(cloneAttributes.map((attribute) => [attribute.key, attribute.value])).toEqual([
      ['description', ['hello']],
      ['effort', [3]],
      ['enabled', [true]],
      ['placeholder', []],
    ]);
    cloneAttributes.forEach((attribute) => {
      expect(Object.hasOwn(attribute, 'raw')).toBe(false);
    });
    expect(cloned[0]?.status).toBe('draft');
    cloneAttributes.forEach((attribute) => {
      expect(Object.isFrozen(attribute)).toBe(true);
      expect(Object.isFrozen(attribute.value)).toBe(true);
    });
  });

  it('omits the origin property entirely when input has no origin', () => {
    const cloned = cloneAndFreezeResources([{ type: 'task', id: 'a', attributes: [] }]);
    const resource = cloned[0];

    expect(resource).toBeDefined();
    expect(resource && 'origin' in resource).toBe(false);
    expect(resource && 'status' in resource).toBe(false);
  });

  it('preserves explicit complete status when present', () => {
    const cloned = cloneAndFreezeResources([
      { type: 'task', id: 'a', status: 'complete', attributes: [] },
    ]);
    const resource = cloned[0];

    expect(resource?.status).toBe('complete');
    expect(resource && 'status' in resource).toBe(true);
  });

  it('clones tuples and reference atoms so inputs cannot mutate snapshot data', () => {
    const referenceA = { kind: 'reference' as const, id: 'task-b' };
    const referenceB = { kind: 'reference' as const, id: 'task-c' };
    const tupleValue = [referenceA, referenceB];
    const sourceResource = {
      type: 'task' as const,
      id: 'task-a',
      attributes: [{ key: 'depends_on', value: tupleValue }],
    };

    const cloned = cloneAndFreezeResources([sourceResource]);
    const clonedAttribute = cloned[0]?.attributes[0];
    expect(clonedAttribute).toBeDefined();
    if (!clonedAttribute) throw new Error('expected attribute');

    const clonedTuple = clonedAttribute.value;
    expect(clonedTuple).toHaveLength(2);

    const clonedRefA = clonedTuple[0];
    const clonedRefB = clonedTuple[1];
    if (!clonedRefA || !isReference(clonedRefA)) throw new Error('expected reference 0');
    if (!clonedRefB || !isReference(clonedRefB)) throw new Error('expected reference 1');

    expect(clonedTuple).not.toBe(tupleValue);
    expect(clonedRefA).not.toBe(referenceA);
    expect(clonedRefB).not.toBe(referenceB);
    expect(Object.isFrozen(clonedTuple)).toBe(true);
    expect(Object.isFrozen(clonedRefA)).toBe(true);
    expect(Object.isFrozen(clonedRefB)).toBe(true);

    referenceA.id = 'mutated';
    tupleValue.push({ kind: 'reference', id: 'late-add' });

    expect(clonedRefA.id).toBe('task-b');
    expect(clonedTuple).toHaveLength(2);
  });

  it('freezes the origin clone independently from the input origin', () => {
    const sourceOrigin = {
      kind: 'range' as const,
      startByte: 0,
      endByte: 10,
      startRow: 2,
      endRow: 2,
      document: 'a.siren',
    };
    const sourceResource: Resource = {
      type: 'task',
      id: 'a',
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
      kind: 'range' as const,
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
        attributes: [{ key: 'description', value: ['x'], origin: attributeOrigin }],
      },
    ]);

    const clonedAttribute = cloned[0]?.attributes[0];
    expect(clonedAttribute?.origin).toBeDefined();
    expect(clonedAttribute?.origin).not.toBe(attributeOrigin);
    expect(Object.isFrozen(clonedAttribute?.origin)).toBe(true);
  });
});
