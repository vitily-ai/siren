/**
 * Integration: opaque metadata passthrough through SirenBuilder → SirenProject
 *
 * Contract: enumerable own metadata added to SirenDocument, SirenEntry, and
 * Attribute objects is treated as opaque by core and MUST survive the
 * SirenBuilder → SirenProject pipeline — including pipeline modules that
 * rewrite entry status (implicit draft milestones, implicit completion).
 *
 * Core exposes no metadata API; metadata is preserved structurally via clone.
 *
 * The fixtures use structural subtyping — each core IR type is extended with
 * additional fields. The objects are fed into SirenBuilder as the base type
 * (TypeScript allows this due to structural compatibility), built into a
 * SirenProject, and then the outputs are cast back to the extended types.
 */
import { describe, expect, it } from 'vitest';
import { type Attribute, SirenBuilder, type SirenDocument, type SirenEntry } from '../src';

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------

interface ExtendedAttribute extends Attribute {
  testValue: 'preserved';
}

interface ExtendedEntry extends SirenEntry {
  testValue: 'preserved';
  attributes: readonly ExtendedAttribute[];
}

interface ExtendedDocument extends SirenDocument {
  testValue: 'preserved';
  entries: readonly ExtendedEntry[];
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const attr: ExtendedAttribute = {
  key: 'description',
  value: ['a test task'],
  testValue: 'preserved',
};

const entry: ExtendedEntry = {
  type: 'task',
  id: 'task-alpha',
  attributes: [attr],
  testValue: 'preserved',
};

const doc: ExtendedDocument = {
  id: 'doc-one',
  entries: [entry],
  testValue: 'preserved',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extended field passthrough: SirenBuilder → SirenProject', () => {
  it('preserves testValue on document through builder.documents', () => {
    const builder = SirenBuilder.fromDocuments([doc]);
    const outDoc = builder.documents[0] as ExtendedDocument;

    expect(outDoc.testValue).toBe('preserved');
  });

  it('preserves testValue on entry through project.findEntryById', () => {
    const project = SirenBuilder.fromDocuments([doc]).build();
    const outEntry = project.findEntryById('task-alpha') as ExtendedEntry;

    expect(outEntry.testValue).toBe('preserved');
  });

  it('preserves testValue on attribute through project.findEntryById', () => {
    const project = SirenBuilder.fromDocuments([doc]).build();
    const outAttr = project.findEntryById('task-alpha').attributes[0] as ExtendedAttribute;

    expect(outAttr.testValue).toBe('preserved');
  });
});

describe('opaque metadata survives pipeline status rewrites', () => {
  interface MetaEntry extends SirenEntry {
    meta: { tag: string };
  }

  it('preserves entry metadata through ImplicitDraftMilestoneModule (orphan milestone → draft)', () => {
    const orphanMilestone: MetaEntry = {
      type: 'milestone',
      id: 'orphan-ms',
      attributes: [],
      meta: { tag: 'orphan-meta' },
    };

    const project = SirenBuilder.fromDocuments([
      { id: 'doc-draft', entries: [orphanMilestone] },
    ]).build();

    const out = project.findEntryById('orphan-ms') as MetaEntry;
    expect(out.status).toBe('draft');
    expect(out.meta).toBeDefined();
    expect(out.meta.tag).toBe('orphan-meta');
  });

  it('preserves entry metadata through ImplicitCompletionModule (milestone with completed deps → complete)', () => {
    const completedTask: SirenEntry = {
      type: 'task',
      id: 'task-done',
      status: 'complete',
      attributes: [],
    };
    const milestone: MetaEntry = {
      type: 'milestone',
      id: 'ms-complete',
      attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'task-done' }] }],
      meta: { tag: 'completion-meta' },
    };

    const project = SirenBuilder.fromDocuments([
      { id: 'doc-complete', entries: [completedTask, milestone] },
    ]).build();

    const out = project.findEntryById('ms-complete') as MetaEntry;
    expect(out.status).toBe('complete');
    expect(out.meta).toBeDefined();
    expect(out.meta.tag).toBe('completion-meta');
  });
});
