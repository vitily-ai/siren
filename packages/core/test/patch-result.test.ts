import { describe, expect, it } from 'vitest';
import { SirenBuilder } from '../src/ir/assembly';
import type { SirenDocument } from '../src/ir/document';
import {
  type ChangeMode,
  computeDelta,
  type DocumentChange,
  type ResourceChange,
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
 * Helper to generate reliably stamped old and new documents for computeDelta,
 * mimicking what SirenBuilder.patch() does internally, allowing us to unit test
 * the pure computeDelta logic using real Eph-IDs.
 */
function getDelta(
  oldDocsInput: SirenDocument[],
  patchFn: (docs: SirenDocument[]) => SirenDocument[],
): readonly DocumentChange[] {
  const bOld = SirenBuilder.fromDocuments(oldDocsInput);
  const oldDocs = bOld.documents as unknown as SirenDocument[];
  const newDocsInput = patchFn([...oldDocs]);
  const bNew = SirenBuilder.fromDocuments(newDocsInput);
  const newDocs = bNew.documents as unknown as SirenDocument[];

  return computeDelta(oldDocs, newDocs);
}

// ---------------------------------------------------------------------------
// Resource-level change modes
// ---------------------------------------------------------------------------

describe('computeDelta - resource change modes', () => {
  it('created: new resourceId in an existing doc appears as created', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources, makeTask('t2')] },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    const t2Change = docChange.resources.find((r) => r.resourceId === 't2');
    expect(t2Change).toEqual<ResourceChange>({ resourceId: 't2', mode: 'created' });
  });

  it('updated: spreading an existing resource with the same id loses eph-id and registers as updated', () => {
    // Spread creates a new object — non-enumerable eph-id is NOT carried over
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => [
      { ...docs[0]!, resources: docs[0]!.resources.map((r) => ({ ...r })) },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'updated' }]);
  });

  it('deleted: resource removed from doc appears as deleted', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])], (docs) => [
      { ...docs[0]!, resources: docs[0]!.resources.filter((r) => r.id !== 't1') },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    const t1Change = docChange.resources.find((r) => r.resourceId === 't1');
    expect(t1Change).toEqual<ResourceChange>({ resourceId: 't1', mode: 'deleted' });
    // t2 is unchanged — must not appear
    expect(docChange.resources.find((r) => r.resourceId === 't2')).toBeUndefined();
  });

  it('preserves duplicate resources when computing changes', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('dup'), makeTask('dup')])], (docs) => [
      {
        ...docs[0]!,
        resources: [
          docs[0]!.resources[0]!,
          { ...docs[0]!.resources[1]!, status: 'complete' as const },
        ],
      },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    // Because only one `dup` was modified, we expect exactly one 'updated' change,
    // not a tangled mess of 'updated', 'created', etc.
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 'dup', mode: 'updated' }]);
  });

  it('correctly matches fresh duplicates inserted before existing ones by eph-id', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('dup')])], (docs) => [
      {
        ...docs[0]!,
        resources: [
          makeTask('dup'), // fresh duplicate inserted before
          docs[0]!.resources[0]!, // perfectly preserved existing duplicate
        ],
      },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    // The existing duplicate is perfectly preserved, so no change should be emitted for it.
    // The newly inserted duplicate is entirely fresh, so it should be reported as 'created'.
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 'dup', mode: 'created' }]);
  });

  it('detects a deleted duplicate resource when remaining copies decrease', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('dup'), makeTask('dup')])], (docs) => [
      {
        ...docs[0]!,
        resources: [docs[0]!.resources[0]!], // Keep only one duplicate
      },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 'dup', mode: 'deleted' }]);
  });
});

// ---------------------------------------------------------------------------
// Document-level change modes
// ---------------------------------------------------------------------------

describe('computeDelta - document change modes', () => {
  it('created: new document added via patch appears as created', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => [
      ...docs,
      makeDoc('doc-b', [makeTask('t2')]),
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.documentId).toBe('doc-b');
    expect(docChange.mode).toBe<ChangeMode>('created');
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't2', mode: 'created' }]);
  });

  it('updated: document with resource changes appears as updated', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources, makeTask('t2')] },
    ]);

    const docChange = changes.find((c) => c.documentId === 'doc-a');
    expect(docChange).toBeDefined();
    expect(docChange!.mode).toBe<ChangeMode>('updated');
  });

  it('deleted: removed document appears as deleted', () => {
    const changes = getDelta(
      [makeDoc('doc-a', [makeTask('t1')]), makeDoc('doc-b', [makeTask('t2')])],
      (docs) => docs.filter((d) => d.id !== 'doc-a'),
    );

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('deleted');
    // resources is always present on DocumentChange
    expect(Array.isArray(docChange.resources)).toBe(true);
  });

  it('directive-only change: undefined → defined counts as updated with empty resources array', () => {
    // Before: no directive. After: directive set.
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => [
      { ...docs[0]!, directive: { implicitMilestone: false } },
    ]);

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.resources).toEqual([]);
  });

  it('unchanged documents are omitted from changes entirely', () => {
    // Only doc-b gains a resource
    const changes = getDelta(
      [makeDoc('doc-a', [makeTask('t1')]), makeDoc('doc-b', [makeTask('t2')])],
      (docs) => [
        docs[0]!, // unchanged
        { ...docs[1]!, resources: [...docs[1]!.resources, makeTask('t3')] },
      ],
    );

    expect(changes.every((c) => c.documentId !== 'doc-a')).toBe(true);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.documentId).toBe('doc-b');
  });
});

// ---------------------------------------------------------------------------
// Cross-document resource move
// ---------------------------------------------------------------------------

describe('computeDelta - cross-document resource move', () => {
  it('resource deleted in source document, created in destination document', () => {
    // Remove t1 from doc-a; add a fresh t1 object to doc-b
    // (same resourceId, new object → new eph-id → created in dest)
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')]), makeDoc('doc-b', [])], (docs) => {
      const [docA, docB] = docs;
      return [
        { ...docA!, resources: [] },
        { ...docB!, resources: [makeTask('t1')] },
      ];
    });

    expect(changes).toHaveLength(2);
    const srcChange = changes.find((c) => c.documentId === 'doc-a')!;
    const dstChange = changes.find((c) => c.documentId === 'doc-b')!;

    expect(srcChange.mode).toBe<ChangeMode>('updated');
    expect(srcChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'deleted' }]);

    expect(dstChange.mode).toBe<ChangeMode>('updated');
    expect(dstChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'created' }]);
  });
});

// ---------------------------------------------------------------------------
// Eph-id preservation
// ---------------------------------------------------------------------------

describe('computeDelta - eph-id preservation', () => {
  it('same frozen resource reference passed back is not classified as updated', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])], (docs) => [
      { id: 'doc-a', resources: [docs[0]!.resources[0]!, docs[0]!.resources[1]!] },
    ]);
    expect(changes).toEqual([]);
  });

  it('reordering resources within a document produces no change', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1'), makeTask('t2')])], (docs) => [
      { ...docs[0]!, resources: [...docs[0]!.resources].reverse() },
    ]);
    expect(changes).toEqual([]);
  });

  it('reordering documents produces no change', () => {
    const changes = getDelta(
      [makeDoc('doc-a', [makeTask('t1')]), makeDoc('doc-b', [makeTask('t2')])],
      (docs) => [...docs].reverse(),
    );
    expect(changes).toEqual([]);
  });

  it('JSON round-trip: serialised resource loses eph-id and registers as updated', () => {
    const changes = getDelta([makeDoc('doc-a', [makeTask('t1')])], (docs) => {
      const parsed = JSON.parse(JSON.stringify(docs[0]!.resources[0]!)) as Resource;
      return [{ ...docs[0]!, resources: [parsed] }];
    });

    expect(changes).toHaveLength(1);
    const docChange = changes[0]!;
    expect(docChange.resources).toEqual<ResourceChange[]>([{ resourceId: 't1', mode: 'updated' }]);
  });
});
