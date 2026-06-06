/**
 * TEST BOUNDARY:
 * This module is exclusively for testing the `SirenBuilder` initialization, compilation (`.build()`),
 * diagnostic generation, and internal object identity/eph-id mechanics during construction.
 *
 * Mutation APIs and delta computations (`.patch()`, `withEntry()`, change modes) belong
 * in `assembly-patch.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { SirenBuilder } from './assembly';
import { SirenProject } from './context';
import { SirenCoreError } from './errors';
import { isReference, type Origin, type SirenEntry } from './types';

function origin(document: string, startRow: number): Origin {
  return {
    kind: 'range',
    startByte: startRow * 10,
    endByte: startRow * 10 + 9,
    startRow,
    endRow: startRow,
    document,
  };
}

/**
 * Copy every non-enumerable symbol property from `src` to `dst` in place.
 * Used to verify the duplicate eph-id/identity check is symbol-identity-based
 * rather than plain object-reference-based.
 */
function copySymbolProperties(src: object, dst: object): void {
  for (const sym of Object.getOwnPropertySymbols(src)) {
    const descriptor = Object.getOwnPropertyDescriptor(src, sym)!;
    Object.defineProperty(dst, sym, descriptor);
  }
}

describe('SirenBuilder', () => {
  it('preserves caller entry order in the builder snapshot and first-occurrence order in the built context', () => {
    const entries: SirenEntry[] = [
      { type: 'task', id: 'second', attributes: [] },
      { type: 'task', id: 'first', attributes: [] },
      { type: 'task', id: 'second', status: 'complete', attributes: [] },
    ];

    const assembly = SirenBuilder.fromEntries(entries);
    const context = assembly.build();

    expect(assembly.entries.map((entry) => entry.id)).toEqual(['second', 'first', 'second']);
    expect(context.entries.map((entry) => entry.id)).toEqual(['second', 'first']);
  });

  it('clones and recursively freezes assembly entries', () => {
    const sourceEntry = {
      type: 'task' as const,
      id: 'task-a',
      attributes: [
        {
          key: 'depends_on',
          value: [{ kind: 'reference' as const, id: 'task-b' }],
          origin: {
            kind: 'range' as const,
            startByte: 0,
            endByte: 20,
            startRow: 0,
            endRow: 0,
            document: 'project.siren',
          },
        },
      ],
      origin: {
        kind: 'range' as const,
        startByte: 0,
        endByte: 20,
        startRow: 0,
        endRow: 0,
        document: 'project.siren',
      },
    };
    const assembly = SirenBuilder.fromEntries([sourceEntry]);
    const rawEntry = assembly.entries[0];

    expect(rawEntry).toBeDefined();
    if (!rawEntry) throw new Error('expected raw entry');
    const rawAttribute = rawEntry.attributes[0];
    expect(rawAttribute).toBeDefined();
    if (!rawAttribute) throw new Error('expected raw attribute');

    expect(rawEntry).not.toBe(sourceEntry);
    expect(rawEntry.attributes).not.toBe(sourceEntry.attributes);
    expect(rawAttribute).not.toBe(sourceEntry.attributes[0]);
    expect(Object.isFrozen(assembly)).toBe(true);
    expect(Object.isFrozen(assembly.entries)).toBe(true);
    expect(Object.isFrozen(rawEntry)).toBe(true);
    expect(Object.isFrozen(rawEntry.attributes)).toBe(true);
    expect(Object.isFrozen(rawAttribute)).toBe(true);
    expect(Object.isFrozen(rawAttribute.origin)).toBe(true);
    expect(Object.isFrozen(rawEntry.origin)).toBe(true);

    const rawValue = rawAttribute.value;
    expect(rawValue).toHaveLength(1);
    expect(rawValue).not.toBe(sourceEntry.attributes[0]!.value);
    expect(Object.isFrozen(rawValue)).toBe(true);

    const rawElement = rawValue[0];
    if (rawElement === undefined || !isReference(rawElement)) {
      throw new Error('expected reference value');
    }
    expect(rawElement).not.toBe(sourceEntry.attributes[0]!.value[0]);
    expect(Object.isFrozen(rawElement)).toBe(true);

    sourceEntry.id = 'mutated-task';
    sourceEntry.attributes[0]!.value[0]!.id = 'mutated-dependency';

    expect(rawEntry.id).toBe('task-a');
    expect(rawElement.id).toBe('task-b');
  });

  it('builds repeatable non-consuming SirenProject instances', () => {
    const assembly = SirenBuilder.fromEntries([
      { type: 'task', id: 'task-a', attributes: [] },
      { type: 'task', id: 'task-b', attributes: [] },
    ]);

    const firstContext = assembly.build();
    const secondContext = assembly.build();

    expect(firstContext).toBeInstanceOf(SirenProject);
    expect(secondContext).toBeInstanceOf(SirenProject);
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext.entries.map((entry) => entry.id)).toEqual(['task-a', 'task-b']);
    expect(secondContext.entries.map((entry) => entry.id)).toEqual(['task-a', 'task-b']);
    expect(assembly.entries.map((entry) => entry.id)).toEqual(['task-a', 'task-b']);
  });

  it('keeps raw duplicates available while the built context uses first occurrence wins', () => {
    const entries: SirenEntry[] = [
      { type: 'task', id: 'duplicate', attributes: [] },
      { type: 'task', id: 'duplicate', status: 'complete', attributes: [] },
    ];

    const assembly = SirenBuilder.fromEntries(entries);
    const context = assembly.build();

    expect(assembly.entries.map((entry) => entry.status)).toEqual([undefined, 'complete']);
    expect(context.entries).toHaveLength(1);
    expect(context.entries[0]?.status).toBeUndefined();
    expect(context.diagnostics.filter((diagnostic) => diagnostic.code === 'W003')).toHaveLength(1);
  });

  it('builds the expected immutable context output with ordered diagnostics and source attribution', () => {
    const assembly = SirenBuilder.fromEntries([
      {
        type: 'task',
        id: 'cycle-a',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-b' }] }],
        origin: origin('cycle-a.siren', 0),
      },
      {
        type: 'task',
        id: 'cycle-b',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-a' }] }],
        origin: origin('cycle-b.siren', 1),
      },
      {
        type: 'task',
        id: 'has-dangling',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'missing' }] }],
        origin: origin('dangling.siren', 4),
      },
      {
        type: 'task',
        id: 'finished-task',
        status: 'complete',
        attributes: [],
        origin: origin('complete-first.siren', 6),
      },
      {
        type: 'task',
        id: 'finished-task',
        attributes: [],
        origin: origin('complete-second.siren', 8),
      },
      {
        type: 'milestone',
        id: 'release',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'finished-task' }] }],
        origin: origin('release.siren', 10),
      },
    ]);

    const context = assembly.build();

    expect(context.entries.map((entry) => [entry.id, entry.status])).toEqual([
      ['cycle-a', undefined],
      ['cycle-b', undefined],
      ['has-dangling', undefined],
      ['finished-task', 'complete'],
      ['release', 'complete'],
    ]);
    expect(context.diagnostics).toEqual([
      {
        code: 'W001',
        severity: 'warning',
        nodes: ['cycle-a', 'cycle-b', 'cycle-a'],
      },
      {
        code: 'W002',
        severity: 'warning',
        entryId: 'has-dangling',
        entryType: 'task',
        dependencyId: 'missing',
      },
      {
        code: 'W003',
        severity: 'warning',
        entryId: 'finished-task',
        entryType: 'task',
      },
    ]);
    expect(Object.isFrozen(context.entries)).toBe(false);
    expect(Object.isFrozen(context.diagnostics)).toBe(true);
    expect(Object.isFrozen(context.diagnostics[0])).toBe(true);
    expect('cycles' in (context as unknown as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
  });

  it('exposes fromEntries as the primary constructor entrypoint', () => {
    expect(typeof SirenBuilder.fromEntries).toBe('function');
    expect(SirenBuilder.fromEntries.length).toBe(1);

    const builder = SirenBuilder.fromEntries([{ type: 'task', id: 'login', attributes: [] }]);
    expect(builder.entries.map((entry) => entry.id)).toEqual(['login']);
  });

  it('exposes pre-build entries and not pre-build documents', () => {
    const builder = SirenBuilder.fromEntries([{ type: 'task', id: 'task-a', attributes: [] }]);

    const preBuildSurface = builder as unknown as Record<string, unknown>;
    expect('entries' in preBuildSurface).toBe(true);
    expect('documents' in preBuildSurface).toBe(false);
  });

  it('throws SirenCoreError when the same eph-id appears in two raw entry slots', () => {
    const seed = SirenBuilder.fromEntries([{ type: 'task', id: 't1', attributes: [] }]);
    const frozenEntry = seed.entries[0]!;

    // Build a distinct object that carries the same eph-id symbol property
    const imposter: SirenEntry = { ...frozenEntry };
    copySymbolProperties(frozenEntry, imposter);

    expect(() => {
      SirenBuilder.fromEntries([frozenEntry, imposter]);
    }).toThrow(SirenCoreError);
  });

  // -------------------------------------------------------------------------
  // Eph-id stamping during construction
  // These tests document when the non-enumerable eph-id symbol IS and IS NOT
  // applied to entries, using only observable surface (Object.getOwnPropertySymbols).
  // -------------------------------------------------------------------------

  describe('eph-id stamping during construction', () => {
    it('fresh entry has no symbol properties before ingestion', () => {
      const fresh: SirenEntry = { type: 'task', id: 't1', attributes: [] };
      expect(Object.getOwnPropertySymbols(fresh)).toHaveLength(0);
    });

    it('entry has exactly one non-enumerable symbol property after ingestion', () => {
      const fresh: SirenEntry = { type: 'task', id: 't1', attributes: [] };
      const b = SirenBuilder.fromEntries([fresh]);
      const ingested = b.entries[0]!;

      const syms = Object.getOwnPropertySymbols(ingested);
      expect(syms).toHaveLength(1);

      const descriptor = Object.getOwnPropertyDescriptor(ingested, syms[0]!);
      expect(descriptor?.enumerable).toBe(false);
    });

    it('spread of an ingested entry drops the eph-id symbol', () => {
      const b = SirenBuilder.fromEntries([{ type: 'task', id: 't1', attributes: [] }]);
      const ingested = b.entries[0]!;

      const spread = { ...ingested };
      expect(Object.getOwnPropertySymbols(spread)).toHaveLength(0);
    });

    it('JSON round-trip of an ingested entry drops the eph-id symbol', () => {
      const b = SirenBuilder.fromEntries([{ type: 'task', id: 't1', attributes: [] }]);
      const ingested = b.entries[0]!;

      const roundTripped = JSON.parse(JSON.stringify(ingested)) as SirenEntry;
      expect(Object.getOwnPropertySymbols(roundTripped)).toHaveLength(0);
    });

    it('re-ingesting a previously-frozen entry preserves the same eph-id value', () => {
      const b1 = SirenBuilder.fromEntries([{ type: 'task', id: 't1', attributes: [] }]);
      const frozen = b1.entries[0]!;
      const frozenSymbols = Object.getOwnPropertySymbols(frozen);
      expect(frozenSymbols).toHaveLength(1);
      const [sym] = frozenSymbols;
      expect(sym).toBeDefined();

      const b2 = SirenBuilder.fromEntries([frozen]);
      const reIngested = b2.entries[0]!;

      const reIngestedSymbols = Object.getOwnPropertySymbols(reIngested);
      expect(reIngestedSymbols).toHaveLength(1);
      const [reIngestedSym] = reIngestedSymbols;
      expect(reIngestedSym).toBeDefined();
      expect(reIngestedSym).toBe(sym); // same symbol key
      expect((reIngested as Record<symbol, unknown>)[sym!]).toBe(
        (frozen as Record<symbol, unknown>)[sym!],
      );
    });

    it('two independent ingestions of the same fresh entry produce different eph-ids', () => {
      const fresh: SirenEntry = { type: 'task', id: 't1', attributes: [] };
      const b1 = SirenBuilder.fromEntries([fresh]);
      const b2 = SirenBuilder.fromEntries([fresh]);

      const r1 = b1.entries[0]!;
      const r2 = b2.entries[0]!;

      const [sym1] = Object.getOwnPropertySymbols(r1);
      const [sym2] = Object.getOwnPropertySymbols(r2);
      // Both have the same symbol key (it is module-level constant), but different values
      expect(sym1).toBe(sym2);
      expect((r1 as Record<symbol, unknown>)[sym1!]).not.toBe(
        (r2 as Record<symbol, unknown>)[sym2!],
      );
    });

    it('fromEntries also stamps eph-ids on ingested entries', () => {
      const b = SirenBuilder.fromEntries([{ type: 'task', id: 't1', attributes: [] }]);
      const ingested = b.entries[0]!;
      expect(Object.getOwnPropertySymbols(ingested)).toHaveLength(1);
    });
  });
});
