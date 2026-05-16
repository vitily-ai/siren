import { describe, expect, it } from 'vitest';
import { SirenBuilder } from '../src/ir/assembly';
import type { SirenDocument } from '../src/ir/document';
import { SirenCoreError } from '../src/ir/errors';
// patch-result.ts does not exist yet — these imports are intentionally failing (TDD red)
import type {
  ChangeMode,
  DocumentChange,
  PatchResult,
  ResourceChange,
} from '../src/ir/patch-result';
import type { Resource } from '../src/ir/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(id: string, resources: Resource[] = []): SirenDocument {
  return { id, resources };
}

function makeTask(id: string): Resource {
  return { type: 'task', id, attributes: [] };
}

/**
 * Copy every non-enumerable symbol property from `src` to `dst` in place.
 * Used to produce a distinct object reference that carries the same eph-id,
 * verifying the duplicate-id check is identity-based rather than
 * object-reference-based.
 */
function copySymbolProperties(src: object, dst: object): void {
  for (const sym of Object.getOwnPropertySymbols(src)) {
    const descriptor = Object.getOwnPropertyDescriptor(src, sym)!;
    Object.defineProperty(dst, sym, descriptor);
  }
}

// ---------------------------------------------------------------------------
// patch() — core delta semantics
// ---------------------------------------------------------------------------

describe('SirenBuilder.patch() returns PatchResult', () => {
  it('result has builder and changes properties', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.patch((docs) => docs);
    expect(result).toHaveProperty('builder');
    expect(result).toHaveProperty('changes');
    expect(result.builder).toBeInstanceOf(SirenBuilder);
    expect(Array.isArray(result.changes)).toBe(true);
  });

  it('no-op patch: changes is empty and builder is a fresh instance', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => docs);
    expect(result.changes).toEqual([]);
    expect(result.builder).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Resource-level change modes
// ---------------------------------------------------------------------------

describe('resource change modes', () => {
  it('created: new resourceId in an existing doc appears as created', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources, makeTask('t2')] },
    ]);

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    const t2Change = docChange.resources.find((r) => r.resourceId === 't2');
    expect(t2Change).toEqual<ResourceChange>({ resourceId: 't2', mode: 'created' });
  });

  it('updated: spreading an existing resource with the same id loses eph-id and registers as updated', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    // Spread creates a new object — non-enumerable eph-id is NOT carried over
    const result = b.patch((docs) => [
      { ...docs[0]!, resources: docs[0]!.resources.map((r) => ({ ...r })) },
    ]);

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'updated' }]);
  });

  it('deleted: resource removed from doc appears as deleted', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])]);
    const result = b.patch((docs) => [
      { ...docs[0]!, resources: docs[0]!.resources.filter((r) => r.id !== 't1') },
    ]);

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    const t1Change = docChange.resources.find((r) => r.resourceId === 't1');
    expect(t1Change).toEqual<ResourceChange>({ resourceId: 't1', mode: 'deleted' });
    // t2 is unchanged — must not appear
    expect(docChange.resources.find((r) => r.resourceId === 't2')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Document-level change modes
// ---------------------------------------------------------------------------

describe('document change modes', () => {
  it('created: new document added via patch appears as created', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => [...docs, makeDoc('doc-b', [makeTask('t2')])]);

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-b');
    expect(docChange.mode).toBe<ChangeMode>('created');
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't2', mode: 'created' }]);
  });

  it('updated: document with resource changes appears as updated', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources, makeTask('t2')] },
    ]);

    const docChange = result.changes.find((c) => c.documentId === 'doc-a');
    expect(docChange).toBeDefined();
    expect(docChange!.mode).toBe<ChangeMode>('updated');
  });

  it('deleted: removed document appears as deleted', () => {
    const b = SirenBuilder.fromDocuments([
      makeDoc('doc-a', [makeTask('t1')]),
      makeDoc('doc-b', [makeTask('t2')]),
    ]);
    const result = b.patch((docs) => docs.filter((d) => d.id !== 'doc-a'));

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('deleted');
    // resources is always present on DocumentChange
    expect(Array.isArray(docChange.resources)).toBe(true);
  });

  it('directive-only change: undefined → defined counts as updated with empty resources array', () => {
    // Before: no directive. After: directive set.
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => [{ ...docs[0]!, directive: { implicitMilestone: false } }]);

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toEqual([]);
  });

  it('unchanged documents are omitted from changes entirely', () => {
    const b = SirenBuilder.fromDocuments([
      makeDoc('doc-a', [makeTask('t1')]),
      makeDoc('doc-b', [makeTask('t2')]),
    ]);
    // Only doc-b gains a resource
    const result = b.patch((docs) => [
      docs[0]!, // unchanged
      { ...docs[1]!, resources: [...docs[1]!.resources, makeTask('t3')] },
    ]);

    expect(result.changes.every((c) => c.documentId !== 'doc-a')).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.documentId).toBe('doc-b');
  });
});

// ---------------------------------------------------------------------------
// Cross-document resource move
// ---------------------------------------------------------------------------

describe('cross-document resource move', () => {
  it('resource deleted in source document, created in destination document', () => {
    const b = SirenBuilder.fromDocuments([
      makeDoc('doc-a', [makeTask('t1')]),
      makeDoc('doc-b', []),
    ]);
    // Remove t1 from doc-a; add a fresh t1 object to doc-b
    // (same resourceId, new object → new eph-id → created in dest)
    const result = b.patch((docs) => {
      const [docA, docB] = docs;
      return [
        { ...docA!, resources: [] },
        { ...docB!, resources: [makeTask('t1')] },
      ];
    });

    expect(result.changes).toHaveLength(2);
    const srcChange = result.changes.find((c) => c.documentId === 'doc-a')!;
    const dstChange = result.changes.find((c) => c.documentId === 'doc-b')!;

    expect(srcChange.mode).toBe<ChangeMode>('updated');
    expect(srcChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'deleted' }]);

    expect(dstChange.mode).toBe<ChangeMode>('updated');
    expect(dstChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'created' }]);
  });
});

// ---------------------------------------------------------------------------
// Eph-id preservation
// ---------------------------------------------------------------------------

describe('eph-id preservation', () => {
  it('same frozen resource reference passed back is not classified as updated', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])]);
    const frozenResource = b.documents[0]!.resources[0]!;
    // Re-ingest the exact same frozen reference alongside a different resource reference
    const result = b.patch((_docs) => [
      { id: 'doc-a', resources: [frozenResource, b.documents[0]!.resources[1]!] },
    ]);
    expect(result.changes).toEqual([]);
  });

  it('reordering resources within a document produces no change', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])]);
    const result = b.patch((docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources].reverse() },
    ]);
    expect(result.changes).toEqual([]);
  });

  it('reordering documents produces no change', () => {
    const b = SirenBuilder.fromDocuments([
      makeDoc('doc-a', [makeTask('t1')]),
      makeDoc('doc-b', [makeTask('t2')]),
    ]);
    const result = b.patch((docs) => [...docs].reverse());
    expect(result.changes).toEqual([]);
  });

  it('JSON round-trip: serialised resource loses eph-id and registers as updated', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result = b.patch((docs) => {
      const parsed = JSON.parse(JSON.stringify(docs[0]!.resources[0]!)) as Resource;
      return [{ ...docs[0]!, resources: [parsed] }];
    });

    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'updated' }]);
  });
});

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

describe('convenience wrappers return PatchResult', () => {
  it('withDocument: created change for the new document', () => {
    const b = SirenBuilder.fromDocuments([]);
    const result: PatchResult = b.withDocument(makeDoc('doc-a', [makeTask('t1')]));

    expect(result).toHaveProperty('builder');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'doc-a',
      mode: 'created',
    });
    expect(result.changes[0]!.resources).toEqual<ResourceChange[]>([
      { resourceId: 't1', mode: 'created' },
    ]);
  });

  it('patchDocument: updated change reflecting resource additions', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.patchDocument('doc-a', (doc) => ({
      ...doc,
      resources: [...doc.resources, makeTask('t2')],
    }));

    expect(result).toHaveProperty('builder');
    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toContainEqual<ResourceChange>({
      resourceId: 't2',
      mode: 'created',
    });
  });

  it('withResource: created change for the new resource in an existing doc', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.withResource(makeTask('t2'), 'doc-a');

    expect(result).toHaveProperty('builder');
    const docChange = result.changes.find((c) => c.documentId === 'doc-a')!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toContainEqual<ResourceChange>({
      resourceId: 't2',
      mode: 'created',
    });
  });

  it('withResource: creates a new document when target does not exist', () => {
    const b = SirenBuilder.fromDocuments([]);
    const result: PatchResult = b.withResource(makeTask('t1'), 'new-doc');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'new-doc',
      mode: 'created',
    });
  });

  it('patchResource: updated change for the patched resource', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.patchResource('t1', (r) => ({
      ...r,
      status: 'complete' as const,
    }));

    expect(result).toHaveProperty('builder');
    const docChange = result.changes.find((c) => c.documentId === 'doc-a')!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toContainEqual<ResourceChange>({
      resourceId: 't1',
      mode: 'updated',
    });
  });
});

// ---------------------------------------------------------------------------
// Construction errors
// ---------------------------------------------------------------------------

describe('construction errors', () => {
  it('throws SirenCoreError when the same eph-id appears in two document slots (different object references)', () => {
    const seed = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const frozenResource = seed.documents[0]!.resources[0]!;

    // Build a distinct object that carries the same eph-id symbol property
    const imposter: Resource = { ...frozenResource };
    copySymbolProperties(frozenResource, imposter);

    expect(() => {
      SirenBuilder.fromDocuments([
        { id: 'doc-a', resources: [frozenResource] },
        { id: 'doc-b', resources: [imposter] }, // different ref, same eph-id
      ]);
    }).toThrow(SirenCoreError);
  });
});
