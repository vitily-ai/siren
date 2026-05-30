/**
 * TEST BOUNDARY:
 * This module is exclusively for testing the `SirenBuilder` mutation APIs and
 * delta computations (`.patch()`, `withEntry()`, etc.).
 *
 * Construction, compilation (`.build()`), diagnostics generation, and initial
 * ephemeral identity stamping concerns belong in `assembly.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  type ChangeMode,
  type DocumentChange,
  type EntryChange,
  type PatchResult,
  SirenBuilder,
  type SirenDocument,
  type SirenEntry,
} from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(id: string, entries: SirenEntry[] = []): SirenDocument {
  return { id, entries };
}

function makeTask(id: string): SirenEntry {
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
    expect(result.changes[0]!.entries).toEqual<EntryChange[]>([{ entryId: 't1', mode: 'created' }]);

    expect(result.builder.documents).toHaveLength(1);
    expect(result.builder.documents[0]!.id).toBe('doc-a');
    expect(result.builder.documents[0]!.entries).toHaveLength(1);
  });

  it('patchDocument: updated change reflecting entry additions', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.patchDocument('doc-a', (doc) => ({
      ...doc,
      entries: [...doc.entries, makeTask('t2')],
    }));

    expect(result).toHaveProperty('builder');
    expect(result.changes).toHaveLength(1);
    const docChange = result.changes[0]!;
    expect(docChange.documentId).toBe('doc-a');
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.entries).toContainEqual<EntryChange>({
      entryId: 't2',
      mode: 'created',
    });

    const updatedDoc = result.builder.documents.find((d) => d.id === 'doc-a')!;
    expect(updatedDoc.entries).toHaveLength(2);
    expect(updatedDoc.entries.map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('withEntry: created change for the new entry in an existing doc', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.withEntry(makeTask('t2'), 'doc-a');

    expect(result).toHaveProperty('builder');
    const docChange = result.changes.find((c) => c.documentId === 'doc-a')!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.entries).toContainEqual<EntryChange>({
      entryId: 't2',
      mode: 'created',
    });

    const updatedDoc = result.builder.documents.find((d) => d.id === 'doc-a')!;
    expect(updatedDoc.entries).toHaveLength(2);
    expect(updatedDoc.entries.map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('withEntry: creates a new document when target does not exist', () => {
    const b = SirenBuilder.fromDocuments([]);
    const result: PatchResult = b.withEntry(makeTask('t1'), 'new-doc');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'new-doc',
      mode: 'created',
    });

    const newDoc = result.builder.documents.find((d) => d.id === 'new-doc')!;
    expect(newDoc).toBeDefined();
    expect(newDoc.entries).toHaveLength(1);
    expect(newDoc.entries[0]!.id).toBe('t1');
  });

  it('withEntry defaults to misc, creating it first and patching it on the next call', () => {
    const b = SirenBuilder.fromDocuments([]);

    const created = b.withEntry(makeTask('t1'));

    expect(created.changes).toHaveLength(1);
    expect(created.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'misc',
      mode: 'created',
    });
    expect(created.changes[0]!.entries).toEqual<EntryChange[]>([
      { entryId: 't1', mode: 'created' },
    ]);

    const createdDoc = created.builder.documents.find((doc) => doc.id === 'misc');
    expect(createdDoc).toBeDefined();
    expect(createdDoc?.directive).toEqual({ implicitMilestone: false });
    expect(createdDoc!.entries).toHaveLength(1);
    expect(createdDoc!.entries).toContainEqual(makeTask('t1'));

    const patched = created.builder.withEntry(makeTask('t2'));

    expect(patched.changes).toHaveLength(1);
    expect(patched.changes[0]).toMatchObject<Partial<DocumentChange>>({
      documentId: 'misc',
      mode: 'updated',
    });
    expect(patched.changes[0]!.entries).toEqual<EntryChange[]>([
      { entryId: 't2', mode: 'created' },
    ]);

    const patchedDoc = patched.builder.documents.find((doc) => doc.id === 'misc');
    expect(patchedDoc).toBeDefined();
    expect(patchedDoc!.entries).toHaveLength(2);
    expect(patchedDoc!.entries).toContainEqual(makeTask('t1'));
    expect(patchedDoc!.entries).toContainEqual(makeTask('t2'));
  });

  it('patchEntry: updated change for the patched entry', () => {
    const b = SirenBuilder.fromDocuments([makeDoc('doc-a', [makeTask('t1')])]);
    const result: PatchResult = b.patchEntry('t1', (r) => ({
      ...r,
      status: 'complete' as const,
    }));

    expect(result).toHaveProperty('builder');
    const docChange = result.changes.find((c) => c.documentId === 'doc-a')!;
    expect(docChange.mode).toBe<ChangeMode>('updated');
    expect(docChange.entries).toContainEqual<EntryChange>({
      entryId: 't1',
      mode: 'updated',
    });

    const updatedEntry = result.builder.documents[0]!.entries[0]!;
    expect(updatedEntry).toMatchObject({ id: 't1', status: 'complete' });
  });
});
