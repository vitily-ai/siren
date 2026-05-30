import { describe, expect, it } from 'vitest';
import { getDependsOn } from '../../../utilities/entry';
import { diagnoseDuplicateEntries } from '../../analysis';
import type { SirenEntry } from '../../types';
import { SynthesisModule } from './synthesis';

type BuilderDocument = {
  id: string;
  entries: readonly SirenEntry[];
  directive?: {
    implicitMilestone?: boolean;
  };
};

type SynthesisOutput = {
  readonly rawEntries: readonly SirenEntry[];
};

async function synthesizeFromDocuments(
  documents: readonly BuilderDocument[],
): Promise<readonly SirenEntry[]> {
  const output: SynthesisOutput = SynthesisModule.run({ documents });
  return output.rawEntries;
}

function findEntryById(entries: readonly SirenEntry[], id: string): SirenEntry {
  const entry = entries.find((entry) => entry.id === id);
  expect(entry).toBeDefined();
  if (!entry) throw new Error(`expected entry '${id}'`);
  return entry;
}

describe('SynthesisModule (red)', () => {
  it('synthesizes a document milestone that depends on document-local roots only', async () => {
    const entries = await synthesizeFromDocuments([
      {
        id: 'auth',
        entries: [
          {
            type: 'task',
            id: 'login',
            attributes: [
              {
                key: 'depends_on',
                value: [
                  { kind: 'reference', id: 'hash-password' },
                  { kind: 'reference', id: 'validate-token' },
                ],
              },
            ],
          },
          { type: 'task', id: 'hash-password', attributes: [] },
          { type: 'task', id: 'validate-token', attributes: [] },
        ],
      },
      {
        id: 'billing',
        entries: [{ type: 'task', id: 'invoice', attributes: [] }],
      },
    ]);

    const authMilestone = findEntryById(entries, 'auth');
    expect(authMilestone.type).toBe('milestone');
    expect(getDependsOn(authMilestone).sort()).toEqual(['login']);
    expect(getDependsOn(authMilestone)).not.toContain('invoice');
  });

  it('synthesizes an orphan milestone for an empty document', async () => {
    const entries = await synthesizeFromDocuments([{ id: 'empty-document', entries: [] }]);

    expect(entries).toHaveLength(1);
    const milestone = findEntryById(entries, 'empty-document');
    expect(milestone.type).toBe('milestone');
    expect(getDependsOn(milestone)).toEqual([]);
  });

  it('suppresses synthesis when the same document explicitly declares milestone id', async () => {
    const entries = await synthesizeFromDocuments([
      {
        id: 'auth',
        entries: [
          {
            type: 'milestone',
            id: 'auth',
            attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'login' }] }],
          },
          { type: 'task', id: 'login', attributes: [] },
        ],
      },
    ]);

    expect(entries.filter((entry) => entry.id === 'auth')).toHaveLength(1);
    const authMilestone = findEntryById(entries, 'auth');
    expect(getDependsOn(authMilestone)).toEqual(['login']);
  });

  it('routes cross-document id collisions through existing W003 handling', async () => {
    const entries = await synthesizeFromDocuments([
      { id: 'auth', entries: [] },
      {
        id: 'ops',
        entries: [{ type: 'milestone', id: 'auth', attributes: [] }],
      },
    ]);

    expect(diagnoseDuplicateEntries(entries).map((diagnostic) => diagnostic.code)).toEqual([
      'W003',
    ]);
  });

  it('does not synthesize milestones when document directive disables implicit milestone', async () => {
    const entries = await synthesizeFromDocuments([
      {
        id: 'adhoc',
        entries: [{ type: 'task', id: 'login', attributes: [] }],
        directive: { implicitMilestone: false },
      },
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(['login']);
    expect(entries.some((entry) => entry.type === 'milestone' && entry.id === 'adhoc')).toBe(false);
  });
});
