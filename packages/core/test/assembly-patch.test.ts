/**
 * TEST BOUNDARY:
 * This module is exclusively for testing the `SirenBuilder` mutation APIs and
 * delta computations (`.patch()`, `withResource()`, etc.).
 *
 * Construction, compilation (`.build()`), diagnostics generation, and initial
 * ephemeral identity stamping concerns belong in `assembly.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  type ChangeMode,
  type DocumentChange,
  type PatchResult,
  type Resource,
  type ResourceChange,
  SirenBuilder,
  type SirenDocument,
} from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(id: string, resources: Resource[] = []): SirenDocument {
  return { id, resources };
}

function makeTask(id: string): Resource {
  return { type: 'task', id, attributes: [] };
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
    expect(result.builder.documents).toEqual(b.documents);
  });
});

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

describe('convenience wrappers', () => {
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

    expect(result.builder.documents).toHaveLength(1);
    expect(result.builder.documents[0]!.id).toBe('doc-a');
    expect(result.builder.documents[0]!.resources).toHaveLength(1);
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

    const updatedDoc = result.builder.documents.find((d) => d.id === 'doc-a')!;
    expect(updatedDoc.resources).toHaveLength(2);
    expect(updatedDoc.resources.map((r) => r.id)).toEqual(['t1', 't2']);
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

    const updatedDoc = result.builder.documents.find((d) => d.id === 'doc-a')!;
    expect(updatedDoc.resources).toHaveLength(2);
    expect(updatedDoc.resources.map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('withResource: creates a new document when target does not exist', () => {
    const b = SirenBuilder.fromDocuments([]);
    const result: PatchResult = b.withResource(makeTask('t1'), 'new-doc');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'new-doc',
      mode: 'created',
    });

    const newDoc = result.builder.documents.find((d) => d.id === 'new-doc')!;
    expect(newDoc).toBeDefined();
    expect(newDoc.resources).toHaveLength(1);
    expect(newDoc.resources[0]!.id).toBe('t1');
  });

  it('withResource defaults to misc, creating it first and patching it on the next call', () => {
    const b = SirenBuilder.fromDocuments([]);

    const created = b.withResource(makeTask('t1'));

    expect(created.changes).toHaveLength(1);
    expect(created.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'misc',
      mode: 'created',
    });
    expect(created.changes[0]!.resources).toEqual<ResourceChange[]>([
      { resourceId: 't1', mode: 'created' },
    ]);

    const createdDoc = created.builder.documents.find((doc) => doc.id === 'misc');
    expect(createdDoc).toBeDefined();
    expect(createdDoc?.directive).toEqual({ implicitMilestone: false });
    expect(createdDoc!.resources).toHaveLength(1);
    expect(createdDoc!.resources).toContainEqual(makeTask('t1'));

    const patched = created.builder.withResource(makeTask('t2'));

    expect(patched.changes).toHaveLength(1);
    expect(patched.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'misc',
      mode: 'updated',
    });
    expect(patched.changes[0]!.resources).toEqual<ResourceChange[]>([
      { resourceId: 't2', mode: 'created' },
    ]);

    const patchedDoc = patched.builder.documents.find((doc) => doc.id === 'misc');
    expect(patchedDoc).toBeDefined();
    expect(patchedDoc!.resources).toHaveLength(2);
    expect(patchedDoc!.resources).toContainEqual(makeTask('t1'));
    expect(patchedDoc!.resources).toContainEqual(makeTask('t2'));
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

    const updatedResource = result.builder.documents[0]!.resources[0]!;
    expect(updatedResource).toMatchObject({ id: 't1', status: 'complete' });
  });
});
