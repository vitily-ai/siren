import { describe, expect, it, vi } from 'vitest';
import { SirenBuilder } from '../assembly';
import { EntryGraph } from '../entry-graph';
import type { SirenEntry } from '../types';
import { runIRBuildPipeline } from './index';

type BuilderDocument = {
  id: string;
  entries: readonly SirenEntry[];
  directive?: {
    implicitMilestone?: boolean;
  };
};

type BuildOutput = {
  readonly entries: readonly SirenEntry[];
  readonly diagnostics: readonly { readonly code: string }[];
};

type DocumentsBuilderSurface = {
  readonly documents: readonly BuilderDocument[];
  build(): BuildOutput;
};

type SirenBuilderDocumentsApi = {
  fromDocuments?: (documents: readonly BuilderDocument[]) => DocumentsBuilderSurface;
  fromEntries?: (
    entries: readonly SirenEntry[],
    ephemeralDocumentId: string,
  ) => DocumentsBuilderSurface;
};

describe('runIRBuildPipeline', () => {
  it('produces graph and ordered diagnostics for a representative project', () => {
    const entries: readonly SirenEntry[] = [
      // duplicate ids → W003
      { type: 'task', id: 'dup', attributes: [] },
      { type: 'task', id: 'dup', status: 'complete', attributes: [] },
      // dangling dep → W002
      {
        type: 'task',
        id: 'has-dangling',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'missing' }] }],
      },
      // cycle → W001
      {
        type: 'task',
        id: 'cycle-a',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-b' }] }],
      },
      {
        type: 'task',
        id: 'cycle-b',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-a' }] }],
      },
      // implicit completion candidate
      { type: 'task', id: 'finished', status: 'complete', attributes: [] },
      {
        type: 'milestone',
        id: 'release',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'finished' }] }],
      },
    ];

    const env = runIRBuildPipeline([
      {
        id: 'adhoc',
        entries,
        directive: { implicitMilestone: false },
      },
    ]);

    expect(env.graph.entries.map((r) => [r.id, r.status])).toEqual([
      ['dup', undefined],
      ['has-dangling', undefined],
      ['cycle-a', undefined],
      ['cycle-b', undefined],
      ['finished', 'complete'],
      ['release', 'complete'],
    ]);

    const codes = env.diagnostics.map((d) => d.code);
    // W001 → W002 → W003 ordering
    expect(codes).toEqual(['W001', 'W002', 'W003']);

    expect(env.graph.getNodes()).toEqual(
      expect.arrayContaining(['dup', 'has-dangling', 'cycle-a', 'cycle-b', 'finished', 'release']),
    );

    expect(env.graph.getEntry('release')?.status).toBe('complete');
  });
});

describe('IR pipeline redundancy regression', () => {
  it('builds EntryGraph exactly twice per SirenBuilder.build()', () => {
    const buildSpy = vi.spyOn(EntryGraph, 'fromEntries');

    try {
      const assembly = SirenBuilder.fromEntries(
        [
          { type: 'task', id: 'task-a', status: 'complete', attributes: [] },
          { type: 'task', id: 'task-b', status: 'complete', attributes: [] },
          {
            type: 'milestone',
            id: 'release',
            attributes: [
              {
                key: 'depends_on',
                value: [
                  { kind: 'reference', id: 'task-a' },
                  { kind: 'reference', id: 'task-b' },
                ],
              },
            ],
          },
        ],
        'adhoc',
      );

      buildSpy.mockClear();
      const ctx = assembly.build();

      // Stable baseline: construct once in GraphModule and once in
      // ImplicitCompletionModule.
      expect(buildSpy).toHaveBeenCalledTimes(2);

      // Cached graph is reused for query helpers — no additional builds.
      ctx.getDependencyTree('release');
      ctx.getTasksByMilestone();
      expect(buildSpy).toHaveBeenCalledTimes(2);
    } finally {
      buildSpy.mockRestore();
    }
  });
});

describe('IR pipeline implicit-draft-milestone integration (red)', () => {
  it('drafts orphan milestone and blocks parent completion in the full pipeline', () => {
    // Exercises ImplicitDraftMilestoneModule + ImplicitCompletionModule
    // interacting end-to-end through the real pipeline wiring.
    const env = runIRBuildPipeline([
      {
        id: 'adhoc',
        directive: { implicitMilestone: false },
        entries: [
          // orphan milestone → drafted; parent depending on it → NOT completed
          { type: 'milestone', id: 'orphan', attributes: [] },
          {
            type: 'milestone',
            id: 'parent-of-orphan',
            attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'orphan' }] }],
          },
          // normal completion path must still work alongside drafting
          { type: 'task', id: 'done', status: 'complete', attributes: [] },
          {
            type: 'milestone',
            id: 'completed-release',
            attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'done' }] }],
          },
        ],
      },
    ]);

    expect(env.graph.entries.map((r) => [r.id, r.status])).toEqual([
      ['orphan', 'draft'],
      ['parent-of-orphan', undefined],
      ['done', 'complete'],
      ['completed-release', 'complete'],
    ]);
  });
});

describe('IR pipeline document milestone synthesis (red)', () => {
  it('treats fromEntries as a thin wrapper over fromDocuments with synthesis disabled directive', () => {
    const api = SirenBuilder as unknown as SirenBuilderDocumentsApi;
    const entries: readonly SirenEntry[] = [{ type: 'task', id: 'task-a', attributes: [] }];

    const fromDocumentsBuilder = api.fromDocuments?.([
      {
        id: 'adhoc',
        entries,
        directive: { implicitMilestone: false },
      },
    ]);
    expect(fromDocumentsBuilder).toBeDefined();
    if (!fromDocumentsBuilder) throw new Error('expected fromDocuments builder');

    const compatibilityBuilder = api.fromEntries?.(entries, 'adhoc');
    expect(compatibilityBuilder).toBeDefined();
    if (!compatibilityBuilder) throw new Error('expected fromEntries wrapper builder');

    expect(compatibilityBuilder.documents).toEqual(fromDocumentsBuilder.documents);

    const fromDocumentsOutput = fromDocumentsBuilder.build();
    const compatibilityOutput = compatibilityBuilder.build();
    expect(compatibilityOutput.entries).toEqual(fromDocumentsOutput.entries);
    expect(compatibilityOutput.diagnostics).toEqual(fromDocumentsOutput.diagnostics);
  });
});
