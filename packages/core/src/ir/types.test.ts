/**
 * Tests for the tuple-first IR type surface.
 *
 * Target shape (see siren/tuple-first-core.siren + docs/adr/0004):
 *   Atom  = string | number | boolean | ResourceReference
 *   Tuple = readonly Atom[]
 *   Attribute.value: Tuple
 *   Attribute.raw: REMOVED
 *   isReference(atom: Atom): atom is ResourceReference
 *   Deleted: ArrayValue, PrimitiveValue, isArray, isPrimitive
 *   Scalars are encoded as single-element tuples.
 *   Empty tuple is the absence value (replaces null in attribute positions).
 */

import { describe, expect, it } from 'vitest';
import {
  type Atom,
  type Attribute,
  isReference,
  type ResourceReference,
  type Tuple,
} from './types';

describe('Tuple-first IR type surface', () => {
  describe('Atom and Tuple', () => {
    it('admits string, number, and boolean scalars as atoms', () => {
      const s: Atom = 'hello';
      const n: Atom = 42;
      const b: Atom = true;
      expect([s, n, b]).toEqual(['hello', 42, true]);
    });

    it('admits ResourceReference as an atom', () => {
      const r: Atom = { kind: 'reference', id: 'taskA' };
      expect(isReference(r)).toBe(true);
    });

    it('rejects null as an atom (compile-time)', () => {
      // @ts-expect-error - null is no longer part of the atom set
      const _x: Atom = null;
      expect(true).toBe(true);
    });

    it('represents a Tuple as a readonly array of atoms', () => {
      const t: Tuple = ['a', 1, true, { kind: 'reference', id: 'r' }];
      expect(t).toHaveLength(4);
    });
  });

  describe('Attribute.value is a Tuple', () => {
    it('accepts a single-element tuple for a scalar value', () => {
      const a: Attribute = { key: 'description', value: ['hello'] };
      expect(a.value).toEqual(['hello']);
      expect(a.value).toHaveLength(1);
    });

    it('accepts a single-element tuple for a numeric scalar', () => {
      const a: Attribute = { key: 'priority', value: [3] };
      expect(a.value).toEqual([3]);
    });

    it('accepts a single-element tuple for a boolean scalar', () => {
      const a: Attribute = { key: 'enabled', value: [true] };
      expect(a.value).toEqual([true]);
    });

    it('accepts a single-element tuple containing a ResourceReference', () => {
      const ref: ResourceReference = { kind: 'reference', id: 'taskA' };
      const a: Attribute = { key: 'depends_on', value: [ref] };
      expect(a.value).toHaveLength(1);
      const first = a.value[0]!;
      expect(isReference(first)).toBe(true);
    });

    it('accepts a multi-element tuple of mixed atoms', () => {
      const a: Attribute = {
        key: 'tags',
        value: ['urgent', 1, true, { kind: 'reference', id: 'r' }],
      };
      expect(a.value).toHaveLength(4);
    });

    it('accepts a multi-element tuple of references for list-valued attributes', () => {
      const a: Attribute = {
        key: 'depends_on',
        value: [
          { kind: 'reference', id: 'taskA' },
          { kind: 'reference', id: 'taskB' },
        ],
      };
      expect(a.value).toHaveLength(2);
      expect(a.value.every((v) => isReference(v))).toBe(true);
    });

    it('treats the empty tuple as the absence value', () => {
      const a: Attribute = { key: 'description', value: [] };
      expect(a.value).toEqual([]);
      expect(a.value).toHaveLength(0);
    });

    it('rejects bare scalar (non-tuple) values for Attribute.value', () => {
      // @ts-expect-error - scalars must be wrapped in a single-element tuple
      const _a: Attribute = { key: 'description', value: 'hello' };
      // @ts-expect-error - bare references are no longer assignable
      const _b: Attribute = { key: 'depends_on', value: { kind: 'reference', id: 'x' } };
      // @ts-expect-error - null is no longer assignable; use [] instead
      const _c: Attribute = { key: 'description', value: null };
      expect(true).toBe(true);
    });

    it('does not expose a `raw` field on Attribute', () => {
      const a: Attribute = { key: 'description', value: ['hello'] };
      // Structural assertion: no `raw` key leaked from any prior shape.
      expect(Object.hasOwn(a, 'raw')).toBe(false);

      // @ts-expect-error - Attribute.raw has been removed from the type
      const _withRaw: Attribute = { key: 'description', value: ['hello'], raw: '"hello"' };
    });
  });

  describe('isReference operates on Atom', () => {
    it('returns true for ResourceReference atoms and narrows the type', () => {
      const a: Atom = { kind: 'reference', id: 'taskA' };
      expect(isReference(a)).toBe(true);
      if (isReference(a)) {
        // narrowed to ResourceReference
        expect(a.id).toBe('taskA');
      } else {
        throw new Error('Expected reference');
      }
    });

    it('returns false for scalar atoms', () => {
      const s: Atom = 'hello';
      const n: Atom = 42;
      const b: Atom = true;
      expect(isReference(s)).toBe(false);
      expect(isReference(n)).toBe(false);
      expect(isReference(b)).toBe(false);
    });
  });
});
