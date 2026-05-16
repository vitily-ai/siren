import { describe, expect, it } from 'vitest';
import { SirenBuilder } from '../src/ir/assembly';
import type { SirenDocument } from '../src/ir/document';
import { SirenCoreError } from '../src/ir/errors';
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

// ---------------------------------------------------------------------------
// .patch(fn)
// ---------------------------------------------------------------------------

describe('SirenBuilder.patch(fn)', () => {
  it('returns a new SirenBuilder with transformed documents', () => {
    const docA = makeDoc('a', [makeTask('t1')]);
    const docB = makeDoc('b', [makeTask('t2')]);
    const builder = SirenBuilder.fromDocuments([docA, docB]);

    const patched = builder.patch((docs) => docs.filter((d) => d.id === 'b'));

    expect(patched).toBeInstanceOf(SirenBuilder);
    expect(patched.documents).toHaveLength(1);
    expect(patched.documents[0]!.id).toBe('b');
  });

  it('does not mutate the original builder', () => {
    const docA = makeDoc('a');
    const builder = SirenBuilder.fromDocuments([docA]);

    builder.patch(() => []);

    expect(builder.documents).toHaveLength(1);
    expect(builder.documents[0]!.id).toBe('a');
  });

  it('patched builder and original are different instances', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('x')]);
    const patched = builder.patch((docs) => [...docs, makeDoc('y')]);

    expect(patched).not.toBe(builder);
    expect(builder.documents).toHaveLength(1);
    expect(patched.documents).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// .withDocument(doc)
// ---------------------------------------------------------------------------

describe('SirenBuilder.withDocument(doc)', () => {
  it('adds a new document when no document with that id exists', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('a')]);

    const updated = builder.withDocument(makeDoc('b'));

    expect(updated.documents).toHaveLength(2);
    expect(updated.documents.map((d) => d.id)).toContain('b');
  });

  it('throws when adding a document with a duplicate id', () => {
    const docV1 = makeDoc('dup', [makeTask('t1')]);
    const docV2 = makeDoc('dup', [makeTask('t2')]);
    const builder = SirenBuilder.fromDocuments([docV1]);

    expect(() => builder.withDocument(docV2)).toThrow(SirenCoreError);
    expect(() => builder.withDocument(docV2)).toThrow('Duplicate document id: "dup"');
  });

  it('does not mutate the original builder', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('a')]);

    builder.withDocument(makeDoc('b'));

    expect(builder.documents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// .withResource(resource, documentId?)
// ---------------------------------------------------------------------------

describe('SirenBuilder.withResource(resource, documentId?)', () => {
  it('adds a resource to an existing document', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [makeTask('t1')])]);

    const updated = builder.withResource(makeTask('t2'), 'doc1');

    const doc = updated.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources).toHaveLength(2);
    expect(doc.resources.map((r) => r.id)).toContain('t2');
  });

  it('adds a resource even when another resource has the same id', () => {
    const taskV1: Resource = { type: 'task', id: 'tx', attributes: [] };
    const taskV2: Resource = { type: 'task', id: 'tx', attributes: [], status: 'complete' };
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [taskV1])]);

    const updated = builder.withResource(taskV2, 'doc1');

    const doc = updated.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources).toHaveLength(2);
    expect(doc.resources[0]!.status).toBeUndefined();
    expect(doc.resources[1]!.status).toBe('complete');
  });

  it('creates the target document when it does not exist', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [makeTask('t1')])]);

    const updated = builder.withResource(makeTask('t2'), 'new-doc');

    const doc = updated.documents.find((d) => d.id === 'new-doc')!;
    expect(doc.resources).toHaveLength(1);
    expect(doc.resources[0]!.id).toBe('t2');
    expect(doc.directive).toEqual({ implicitMilestone: false });
  });

  it('uses misc as the default document id', () => {
    const builder = SirenBuilder.fromDocuments([]);

    const updated = builder.withResource(makeTask('t2'));

    const doc = updated.documents.find((d) => d.id === 'misc')!;
    expect(doc.resources).toHaveLength(1);
    expect(doc.resources[0]!.id).toBe('t2');
    expect(doc.directive).toEqual({ implicitMilestone: false });
  });

  it('does not mutate the original builder', () => {
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [makeTask('t1')])]);

    builder.withResource(makeTask('t2'), 'doc1');

    const doc = builder.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// .patchDocument(documentId, fn)
// ---------------------------------------------------------------------------

describe('SirenBuilder.patchDocument(documentId, fn)', () => {
  it('transforms the target document, returning a new builder', () => {
    const docA = makeDoc('a', [makeTask('t1')]);
    const docB = makeDoc('b', [makeTask('t2')]);
    const builder = SirenBuilder.fromDocuments([docA, docB]);

    const updated = builder.patchDocument('a', (doc) => ({
      ...doc,
      resources: [...doc.resources, makeTask('t3')],
    }));

    const patchedA = updated.documents.find((d) => d.id === 'a')!;
    expect(patchedA.resources).toHaveLength(2);
    expect(patchedA.resources.map((r) => r.id)).toContain('t3');
  });

  it('leaves other documents untouched', () => {
    const docA = makeDoc('a', [makeTask('t1')]);
    const docB = makeDoc('b', [makeTask('t2')]);
    const builder = SirenBuilder.fromDocuments([docA, docB]);

    const updated = builder.patchDocument('a', (doc) => ({ ...doc, resources: [] }));

    const untouchedB = updated.documents.find((d) => d.id === 'b')!;
    expect(untouchedB.resources).toHaveLength(1);
    expect(untouchedB.resources[0]!.id).toBe('t2');
  });

  it('does not mutate the original builder', () => {
    const docA = makeDoc('a', [makeTask('t1')]);
    const builder = SirenBuilder.fromDocuments([docA]);

    builder.patchDocument('a', (doc) => ({ ...doc, resources: [] }));

    expect(builder.documents.find((d) => d.id === 'a')!.resources).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// .patchResource(resourceId, fn)
// ---------------------------------------------------------------------------

describe('SirenBuilder.patchResource(resourceId, fn)', () => {
  it('patches a resource status from undefined to complete', () => {
    const task: Resource = { type: 'task', id: 'tx', attributes: [] };
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [task])]);

    const updated = builder.patchResource('tx', (res) => ({
      ...res,
      status: 'complete' as const,
    }));

    const doc = updated.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources.find((r) => r.id === 'tx')!.status).toBe('complete');
  });

  it('leaves other resources in the same document untouched', () => {
    const t1: Resource = { type: 'task', id: 't1', attributes: [] };
    const t2: Resource = { type: 'task', id: 't2', attributes: [] };
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [t1, t2])]);

    const updated = builder.patchResource('t1', (res) => ({
      ...res,
      status: 'complete' as const,
    }));

    const doc = updated.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources.find((r) => r.id === 't2')!.status).toBeUndefined();
  });

  it('does not mutate the original builder', () => {
    const task: Resource = { type: 'task', id: 'tx', attributes: [] };
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [task])]);

    builder.patchResource('tx', (res) => ({ ...res, status: 'complete' as const }));

    const doc = builder.documents.find((d) => d.id === 'doc1')!;
    expect(doc.resources.find((r) => r.id === 'tx')!.status).toBeUndefined();
  });

  it('leaves documents other than the target untouched', () => {
    const t1: Resource = { type: 'task', id: 't1', attributes: [] };
    const t2: Resource = { type: 'task', id: 't2', attributes: [] };
    const builder = SirenBuilder.fromDocuments([makeDoc('doc1', [t1]), makeDoc('doc2', [t2])]);

    const updated = builder.patchResource('t1', (res) => ({
      ...res,
      status: 'complete' as const,
    }));

    const doc2 = updated.documents.find((d) => d.id === 'doc2')!;
    expect(doc2.resources.find((r) => r.id === 't2')!.status).toBeUndefined();
  });
});
