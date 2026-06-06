import { describe, expect, expectTypeOf, it } from 'vitest';
import { SirenBuilder, type Attribute, type SirenEntry } from '@sirenpm/core';
import type {
  Origin,
  RangeOrigin,
  SourcedAttribute,
  SourcedEntry,
  SyntheticOrigin,
} from './origin';

describe('Origin types', () => {
  describe('RangeOrigin', () => {
    it('has correct structural shape', () => {
      const origin: RangeOrigin = {
        kind: 'range',
        startByte: 0,
        endByte: 42,
        startRow: 1,
        endRow: 3,
        document: 'test.siren',
      };

      expect(origin.kind).toBe('range');
      expect(origin.startByte).toBe(0);
      expect(origin.endByte).toBe(42);
      expect(origin.startRow).toBe(1);
      expect(origin.endRow).toBe(3);
      expect(origin.document).toBe('test.siren');
    });

    it('document is optional', () => {
      const origin: RangeOrigin = {
        kind: 'range',
        startByte: 0,
        endByte: 10,
        startRow: 0,
        endRow: 0,
      };

      expect(origin.document).toBeUndefined();
    });
  });

  describe('SyntheticOrigin', () => {
    it('has correct structural shape', () => {
      const origin: SyntheticOrigin = {
        kind: 'synthetic',
        document: 'generated.siren',
      };

      expect(origin.kind).toBe('synthetic');
      expect(origin.document).toBe('generated.siren');
    });
  });

  describe('Origin union narrowing', () => {
    it('narrows RangeOrigin by kind === "range"', () => {
      const origin: Origin = {
        kind: 'range',
        startByte: 0,
        endByte: 10,
        startRow: 0,
        endRow: 1,
      };

      if (origin.kind === 'range') {
        // After narrowing, startByte/endByte/startRow/endRow are accessible
        expectTypeOf(origin.startByte).toEqualTypeOf<number>();
        expectTypeOf(origin.endByte).toEqualTypeOf<number>();
      }
    });

    it('narrows SyntheticOrigin by kind === "synthetic"', () => {
      const origin: Origin = {
        kind: 'synthetic',
        document: 'synth.siren',
      };

      if (origin.kind === 'synthetic') {
        expectTypeOf(origin.document).toEqualTypeOf<string>();
      }
    });

    it('exhaustive switch covers both kinds', () => {
      const origin: Origin = {
        kind: 'synthetic',
        document: 'x.siren',
      };

      const result: string = (() => {
        switch (origin.kind) {
          case 'range':
            return `range:${origin.startRow}`;
          case 'synthetic':
            return `synthetic:${origin.document}`;
        }
      })();

      expect(result).toBe('synthetic:x.siren');
    });
  });

  describe('SourcedEntry extends SirenEntry', () => {
    it('has all SirenEntry fields plus origin', () => {
      const entry: SourcedEntry = {
        type: 'task',
        id: 'my-task',
        status: 'draft',
        attributes: [],
        origin: {
          kind: 'range',
          startByte: 0,
          endByte: 10,
          startRow: 0,
          endRow: 1,
        },
      };

      expect(entry.type).toBe('task');
      expect(entry.id).toBe('my-task');
      expect(entry.status).toBe('draft');
      expect(entry.attributes).toEqual([]);
      expect(entry.origin.kind).toBe('range');
    });

    it('is structurally assignable to SirenEntry', () => {
      const sourced: SourcedEntry = {
        type: 'milestone',
        id: 'm1',
        attributes: [
          {
            key: 'description',
            value: ['A milestone'],
          },
        ],
        origin: { kind: 'synthetic', document: 'm1' },
      };

      // SourcedEntry must be assignable to SirenEntry
      const _entry: SirenEntry = sourced;
      expect(_entry.id).toBe('m1');
    });

    it('status is optional', () => {
      const entry: SourcedEntry = {
        type: 'task',
        id: 'no-status',
        attributes: [],
        origin: { kind: 'synthetic', document: 'no-status' },
      };

      expect(entry.status).toBeUndefined();
    });
  });

  describe('SourcedAttribute extends Attribute', () => {
    it('has all Attribute fields plus origin', () => {
      const attr: SourcedAttribute = {
        key: 'depends_on',
        value: ['other-task'],
        origin: {
          kind: 'range',
          startByte: 20,
          endByte: 40,
          startRow: 2,
          endRow: 2,
        },
      };

      expect(attr.key).toBe('depends_on');
      expect(attr.value).toEqual(['other-task']);
      expect(attr.origin.kind).toBe('range');
    });

    it('is structurally assignable to Attribute', () => {
      const sourced: SourcedAttribute = {
        key: 'description',
        value: ['hello'],
        origin: { kind: 'synthetic', document: 'x' },
      };

      const _attr: Attribute = sourced;
      expect(_attr.key).toBe('description');
    });
  });

  describe('round-trip through core types', () => {
    it('SourcedEntry[] passes to SirenBuilder.fromEntries()', () => {
      const entries: readonly SourcedEntry[] = [
        {
          type: 'task',
          id: 't1',
          attributes: [
            {
              key: 'description',
              value: ['Task 1'],
              origin: { kind: 'synthetic', document: 'doc' },
            },
          ],
          origin: { kind: 'synthetic', document: 'doc' },
        },
        {
          type: 'milestone',
          id: 'm1',
          attributes: [],
          origin: { kind: 'synthetic', document: 'doc' },
        },
      ];

      // SourcedEntry[] is assignable to readonly SirenEntry[]
      const builder = SirenBuilder.fromEntries(entries);
      expect(builder.entries).toHaveLength(2);
      expect(builder.entries[0].id).toBe('t1');
      expect(builder.entries[1].id).toBe('m1');
    });

    it('SourcedAttribute passes where Attribute is expected', () => {
      const attr: SourcedAttribute = {
        key: 'priority',
        value: [1],
        origin: { kind: 'synthetic', document: 'doc' },
      };

      const acceptAttribute = (a: Attribute): string => a.key;
      expect(acceptAttribute(attr)).toBe('priority');
    });
  });
});
