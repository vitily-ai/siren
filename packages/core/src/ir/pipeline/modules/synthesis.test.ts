import { describe, expect, it } from 'vitest';
import { getDependsOn } from '../../../utilities/entry';
import { diagnoseDuplicateResources } from '../../analysis';
import type { Resource } from '../../types';
import { SynthesisModule } from './synthesis';

type BuilderDocument = {
  id: string;
  resources: readonly Resource[];
  directive?: {
    implicitMilestone?: boolean;
  };
};

type SynthesisOutput = {
  readonly rawResources: readonly Resource[];
};

async function synthesizeFromDocuments(
  documents: readonly BuilderDocument[],
): Promise<readonly Resource[]> {
  const output: SynthesisOutput = SynthesisModule.run({ documents });
  return output.rawResources;
}

function findResourceById(resources: readonly Resource[], id: string): Resource {
  const resource = resources.find((entry) => entry.id === id);
  expect(resource).toBeDefined();
  if (!resource) throw new Error(`expected resource '${id}'`);
  return resource;
}

describe('SynthesisModule (red)', () => {
  it('synthesizes a document milestone that depends on document-local roots only', async () => {
    const resources = await synthesizeFromDocuments([
      {
        id: 'auth',
        resources: [
          {
            type: 'task',
            id: 'login',
            attributes: [
              {
                key: 'depends_on',
                value: {
                  kind: 'array',
                  elements: [
                    { kind: 'reference', id: 'hash-password' },
                    { kind: 'reference', id: 'validate-token' },
                  ],
                },
              },
            ],
          },
          { type: 'task', id: 'hash-password', attributes: [] },
          { type: 'task', id: 'validate-token', attributes: [] },
        ],
      },
      {
        id: 'billing',
        resources: [{ type: 'task', id: 'invoice', attributes: [] }],
      },
    ]);

    const authMilestone = findResourceById(resources, 'auth');
    expect(authMilestone.type).toBe('milestone');
    expect(getDependsOn(authMilestone).sort()).toEqual(['login']);
    expect(getDependsOn(authMilestone)).not.toContain('invoice');
  });

  it('synthesizes an orphan milestone for an empty document', async () => {
    const resources = await synthesizeFromDocuments([{ id: 'empty-document', resources: [] }]);

    expect(resources).toHaveLength(1);
    const milestone = findResourceById(resources, 'empty-document');
    expect(milestone.type).toBe('milestone');
    expect(getDependsOn(milestone)).toEqual([]);
  });

  it('suppresses synthesis when the same document explicitly declares milestone id', async () => {
    const resources = await synthesizeFromDocuments([
      {
        id: 'auth',
        resources: [
          {
            type: 'milestone',
            id: 'auth',
            attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'login' } }],
          },
          { type: 'task', id: 'login', attributes: [] },
        ],
      },
    ]);

    expect(resources.filter((resource) => resource.id === 'auth')).toHaveLength(1);
    const authMilestone = findResourceById(resources, 'auth');
    expect(getDependsOn(authMilestone)).toEqual(['login']);
  });

  it('routes cross-document id collisions through existing W003 handling', async () => {
    const resources = await synthesizeFromDocuments([
      { id: 'auth', resources: [] },
      {
        id: 'ops',
        resources: [{ type: 'milestone', id: 'auth', attributes: [] }],
      },
    ]);

    expect(diagnoseDuplicateResources(resources).map((diagnostic) => diagnostic.code)).toEqual([
      'W003',
    ]);
  });

  it('does not synthesize milestones when document directive disables implicit milestone', async () => {
    const resources = await synthesizeFromDocuments([
      {
        id: 'adhoc',
        resources: [{ type: 'task', id: 'login', attributes: [] }],
        directive: { implicitMilestone: false },
      },
    ]);

    expect(resources.map((resource) => resource.id)).toEqual(['login']);
    expect(
      resources.some((resource) => resource.type === 'milestone' && resource.id === 'adhoc'),
    ).toBe(false);
  });
});
