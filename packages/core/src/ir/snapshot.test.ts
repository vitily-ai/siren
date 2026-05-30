import { describe, expect, it } from 'vitest';
import { EPH_ID, getEphId } from './eph-id';
import { SirenCoreError } from './errors';
import { cloneAndFreezeEntries } from './snapshot';
import { type Attribute, isReference, type SirenEntry } from './types';

interface ExtendedAttribute extends Attribute {
  meta: { tag: string; nested: { values: number[] } };
}

interface ExtendedEntry extends SirenEntry {
  meta: { tag: string; nested: { values: number[] } };
  attributes: readonly ExtendedAttribute[];
}

describe('cloneAndFreezeEntries', () => {
  it('returns a frozen wrapper array even for empty input', () => {
    const cloned = cloneAndFreezeEntries([]);
    expect(cloned).toEqual([]);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it('preserves primitive attribute values as single-element tuples and exposes no raw field', () => {
    const cloned = cloneAndFreezeEntries([
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
    const cloned = cloneAndFreezeEntries([{ type: 'task', id: 'a', attributes: [] }]);
    const entry = cloned[0];

    expect(entry).toBeDefined();
    expect(entry && 'origin' in entry).toBe(false);
    expect(entry && 'status' in entry).toBe(false);
  });

  it('preserves explicit complete status when present', () => {
    const cloned = cloneAndFreezeEntries([
      { type: 'task', id: 'a', status: 'complete', attributes: [] },
    ]);
    const entry = cloned[0];

    expect(entry?.status).toBe('complete');
    expect(entry && 'status' in entry).toBe(true);
  });

  it('clones tuples and reference atoms so inputs cannot mutate snapshot data', () => {
    const referenceA = { kind: 'reference' as const, id: 'task-b' };
    const referenceB = { kind: 'reference' as const, id: 'task-c' };
    const tupleValue = [referenceA, referenceB];
    const sourceEntry = {
      type: 'task' as const,
      id: 'task-a',
      attributes: [{ key: 'depends_on', value: tupleValue }],
    };

    const cloned = cloneAndFreezeEntries([sourceEntry]);
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
    const sourceEntry: SirenEntry = {
      type: 'task',
      id: 'a',
      attributes: [],
      origin: sourceOrigin,
    };

    const cloned = cloneAndFreezeEntries([sourceEntry]);
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
    const cloned = cloneAndFreezeEntries([
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

  it('preserves enumerable own metadata on entries and attributes', () => {
    const sourceAttr: ExtendedAttribute = {
      key: 'description',
      value: ['hello'],
      meta: { tag: 'attr-meta', nested: { values: [1, 2] } },
    };
    const sourceEntry: ExtendedEntry = {
      type: 'task',
      id: 'task-a',
      attributes: [sourceAttr],
      meta: { tag: 'entry-meta', nested: { values: [10, 20] } },
    };

    const [cloned] = cloneAndFreezeEntries([sourceEntry]) as readonly ExtendedEntry[];
    expect(cloned).toBeDefined();
    if (!cloned) throw new Error('expected cloned entry');

    expect(cloned.meta).toBeDefined();
    expect(cloned.meta.tag).toBe('entry-meta');
    expect(cloned.attributes[0]?.meta).toBeDefined();
    expect(cloned.attributes[0]?.meta.tag).toBe('attr-meta');
  });

  it('deep-clones nested metadata so source mutations do not leak into the snapshot, and freezes nested structures', () => {
    const sourceEntry: ExtendedEntry = {
      type: 'task',
      id: 'task-a',
      attributes: [
        {
          key: 'description',
          value: ['x'],
          meta: { tag: 'attr', nested: { values: [1, 2] } },
        },
      ],
      meta: { tag: 'entry', nested: { values: [10, 20] } },
    };

    const [cloned] = cloneAndFreezeEntries([sourceEntry]) as readonly ExtendedEntry[];
    if (!cloned) throw new Error('expected cloned entry');

    expect(cloned.meta).not.toBe(sourceEntry.meta);
    expect(cloned.meta.nested).not.toBe(sourceEntry.meta.nested);
    expect(cloned.meta.nested.values).not.toBe(sourceEntry.meta.nested.values);
    expect(Object.isFrozen(cloned.meta)).toBe(true);
    expect(Object.isFrozen(cloned.meta.nested)).toBe(true);
    expect(Object.isFrozen(cloned.meta.nested.values)).toBe(true);

    const clonedAttrMeta = cloned.attributes[0]?.meta;
    if (!clonedAttrMeta) throw new Error('expected cloned attribute meta');
    expect(clonedAttrMeta).not.toBe(sourceEntry.attributes[0]?.meta);
    expect(Object.isFrozen(clonedAttrMeta)).toBe(true);
    expect(Object.isFrozen(clonedAttrMeta.nested)).toBe(true);
    expect(Object.isFrozen(clonedAttrMeta.nested.values)).toBe(true);

    // Mutate source after ingestion; snapshot must be unaffected.
    sourceEntry.meta.tag = 'MUTATED';
    sourceEntry.meta.nested.values.push(999);
    sourceEntry.attributes[0]!.meta.nested.values.push(999);

    expect(cloned.meta.tag).toBe('entry');
    expect(cloned.meta.nested.values).toEqual([10, 20]);
    expect(clonedAttrMeta.nested.values).toEqual([1, 2]);
  });

  it('keeps optional fields absent on the clone even when enumerable metadata is present', () => {
    const sourceEntry: ExtendedEntry = {
      type: 'task',
      id: 'task-a',
      attributes: [],
      meta: { tag: 'm', nested: { values: [] } },
    };

    const [cloned] = cloneAndFreezeEntries([sourceEntry]);
    if (!cloned) throw new Error('expected cloned entry');

    expect('status' in cloned).toBe(false);
    expect('origin' in cloned).toBe(false);
  });

  // eph-id stamping and preservation
  // ---------------------------------------------------------------------------

  it('stamps a fresh eph-id on an entry that has none', () => {
    const source: SirenEntry = { type: 'task', id: 'a', attributes: [] };
    expect(getEphId(source)).toBeUndefined();

    const [cloned] = cloneAndFreezeEntries([source]);
    if (!cloned) throw new Error('expected entry');

    expect(getEphId(cloned)).toBeDefined();
    expect(typeof getEphId(cloned)).toBe('string');
  });

  it('stamped eph-id is non-enumerable, non-writable, non-configurable, and absent from JSON', () => {
    const [cloned] = cloneAndFreezeEntries([{ type: 'task', id: 'a', attributes: [] }]);
    if (!cloned) throw new Error('expected entry');

    const descriptor = Object.getOwnPropertyDescriptor(cloned, EPH_ID);
    expect(descriptor).toBeDefined();
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
    expect(JSON.stringify(cloned)).not.toContain('sirenEphId');
  });

  it('does not stamp an eph-id on the source entry — only the clone is stamped', () => {
    const source: SirenEntry = { type: 'task', id: 'a', attributes: [] };
    cloneAndFreezeEntries([source]);

    expect(getEphId(source)).toBeUndefined();
  });

  it('two entries without eph-ids each receive a distinct stamp', () => {
    const [a, b] = cloneAndFreezeEntries([
      { type: 'task', id: 'a', attributes: [] },
      { type: 'task', id: 'b', attributes: [] },
    ]);
    if (!a || !b) throw new Error('expected two entries');

    const idA = getEphId(a);
    const idB = getEphId(b);
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('preserves the existing eph-id when the source entry already has one', () => {
    const [stamped] = cloneAndFreezeEntries([{ type: 'task', id: 'a', attributes: [] }]);
    if (!stamped) throw new Error('expected stamped entry');

    const originalId = getEphId(stamped);
    expect(originalId).toBeDefined();

    const [recloned] = cloneAndFreezeEntries([stamped]);
    if (!recloned) throw new Error('expected recloned entry');

    expect(recloned).not.toBe(stamped);
    expect(getEphId(recloned)).toBe(originalId);
  });

  it('preserved eph-id on the clone has a non-enumerable, non-writable, non-configurable descriptor', () => {
    const [stamped] = cloneAndFreezeEntries([{ type: 'task', id: 'a', attributes: [] }]);
    if (!stamped) throw new Error('expected stamped entry');

    const [recloned] = cloneAndFreezeEntries([stamped]);
    if (!recloned) throw new Error('expected recloned entry');

    const descriptor = Object.getOwnPropertyDescriptor(recloned, EPH_ID);
    expect(descriptor).toBeDefined();
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
  });

  it('throws SirenCoreError when two entries in the same call share the same eph-id', () => {
    const [stamped] = cloneAndFreezeEntries([{ type: 'task', id: 'a', attributes: [] }]);
    if (!stamped) throw new Error('expected stamped entry');

    // Passing the same frozen object reference twice → same eph-id → duplicate detected
    expect(() => cloneAndFreezeEntries([stamped, stamped])).toThrow(SirenCoreError);
  });
});
