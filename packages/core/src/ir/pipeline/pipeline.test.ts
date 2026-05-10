import { describe, expect, it, vi } from 'vitest';
import { getDependsOn } from '../../utilities/entry';
import { SirenBuilder } from '../assembly';
import { ResourceGraph } from '../resource-graph';
import type { Resource } from '../types';
import { runIRBuildPipeline } from './index';

describe('runIRBuildPipeline', () => {
  it('produces graph and ordered diagnostics for a representative project', () => {
    const resources: readonly Resource[] = [
      // duplicate ids → W003
      { type: 'task', id: 'dup', attributes: [] },
      { type: 'task', id: 'dup', status: 'complete', attributes: [] },
      // dangling dep → W002
      {
        type: 'task',
        id: 'has-dangling',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
      },
      // cycle → W001
      {
        type: 'task',
        id: 'cycle-a',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
      },
      {
        type: 'task',
        id: 'cycle-b',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
      },
      // implicit completion candidate
      { type: 'task', id: 'finished', status: 'complete', attributes: [] },
      {
        type: 'milestone',
        id: 'release',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'finished' } }],
      },
    ];

    const env = runIRBuildPipeline(resources);

    expect(env.graph.resources.map((r) => [r.id, r.status])).toEqual([
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

    expect(env.graph.getResource('release')?.status).toBe('complete');
  });

  it('synthesizes per-document draft milestones after parsed resources', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'task-a',
        attributes: [],
        origin: { startByte: 1, endByte: 2, startRow: 1, endRow: 1, document: 'dir/alpha.siren' },
      },
      {
        type: 'task',
        id: 'task-b',
        attributes: [],
        // Intentional backslash path to verify Windows separators derive `beta`.
        origin: { startByte: 1, endByte: 2, startRow: 2, endRow: 2, document: 'dir\\beta.siren' },
      },
      {
        type: 'milestone',
        id: 'task-c',
        attributes: [],
        origin: { startByte: 1, endByte: 2, startRow: 3, endRow: 3, document: 'dir/alpha.siren' },
      },
      { type: 'task', id: 'no-origin', attributes: [] },
    ]);

    expect(env.graph.resources.map((resource) => resource.id)).toEqual([
      'task-a',
      'task-b',
      'task-c',
      'no-origin',
      'alpha',
      'beta',
    ]);

    const alphaSynthetic = env.graph.getResource('alpha');
    const betaSynthetic = env.graph.getResource('beta');
    expect(alphaSynthetic).toBeDefined();
    expect(betaSynthetic).toBeDefined();
    expect(alphaSynthetic?.synthetic).toBe(true);
    expect(alphaSynthetic?.status).toBe('draft');
    expect(alphaSynthetic?.origin).toEqual({
      startByte: 0,
      endByte: 0,
      startRow: 0,
      endRow: 0,
      document: 'dir/alpha.siren',
    });
    expect(getDependsOn(alphaSynthetic!)).toEqual(['task-a', 'task-c']);
    expect(betaSynthetic?.synthetic).toBe(true);
    expect(betaSynthetic?.status).toBe('draft');
    expect(getDependsOn(betaSynthetic!)).toEqual(['task-b']);
  });

  it('skips synthetic milestone when the same document has an explicit milestone collision', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'task-a',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 0, endRow: 0, document: 'project/release.siren' },
      },
      {
        type: 'milestone',
        id: 'release',
        attributes: [],
        origin: { startByte: 2, endByte: 3, startRow: 1, endRow: 1, document: 'project/release.siren' },
      },
    ]);

    expect(env.graph.resources.map((resource) => resource.id)).toEqual(['task-a', 'release']);
    expect(env.graph.resources.find((resource) => resource.id === 'release')?.synthetic).toBeUndefined();
    expect(env.diagnostics).toEqual([]);
  });

  it('synthesizes a tasks-only document milestone with source-ordered depends_on', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'first-task',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 3, endRow: 3, document: 'work/foo.siren' },
      },
      {
        type: 'task',
        id: 'second-task',
        attributes: [],
        origin: { startByte: 2, endByte: 3, startRow: 10, endRow: 10, document: 'work/foo.siren' },
      },
    ]);

    const synthetic = env.graph.getResource('foo');
    expect(synthetic?.synthetic).toBe(true);
    expect(synthetic?.status).toBe('draft');
    expect(getDependsOn(synthetic!)).toEqual(['first-task', 'second-task']);
  });

  it('still synthesizes when explicit task id matches basename and emits W003', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'foo',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 4, endRow: 4, document: 'foo.siren' },
      },
    ]);

    expect(env.graph.resources.map((resource) => [resource.type, resource.id])).toEqual([['task', 'foo']]);
    expect(env.diagnostics).toEqual([
      {
        code: 'W003',
        severity: 'warning',
        resourceId: 'foo',
        resourceType: 'milestone',
        file: 'foo.siren',
        firstFile: 'foo.siren',
        firstLine: 5,
        firstColumn: 0,
        secondLine: 1,
        secondColumn: 0,
      },
    ]);
  });

  it('cannot synthesize for empty documents when no resources represent those files', () => {
    const env = runIRBuildPipeline([]);
    expect(env.graph.resources).toEqual([]);
    expect(env.diagnostics).toEqual([]);
  });

  it('does not synthesize for resources missing origin.document', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'task-a',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 0, endRow: 0 },
      },
      {
        type: 'milestone',
        id: 'milestone-a',
        attributes: [],
      },
    ]);
    expect(env.graph.resources.map((resource) => resource.id)).toEqual(['task-a', 'milestone-a']);
    expect(env.diagnostics).toEqual([]);
  });

  it('emits one W003 for cross-document implicit+implicit basename clashes', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'task-a',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 2, endRow: 2, document: 'a/foo.siren' },
      },
      {
        type: 'task',
        id: 'task-b',
        attributes: [],
        origin: { startByte: 2, endByte: 3, startRow: 7, endRow: 7, document: 'b/foo.siren' },
      },
    ]);

    expect(env.graph.resources.map((resource) => resource.id)).toEqual(['task-a', 'task-b', 'foo']);
    expect(env.diagnostics).toEqual([
      {
        code: 'W003',
        severity: 'warning',
        resourceId: 'foo',
        resourceType: 'milestone',
        file: 'b/foo.siren',
        firstFile: 'a/foo.siren',
        firstLine: 1,
        firstColumn: 0,
        secondLine: 1,
        secondColumn: 0,
      },
    ]);
  });

  it('emits W003 against explicit first occurrence for cross-document explicit+implicit clashes', () => {
    const env = runIRBuildPipeline([
      {
        type: 'milestone',
        id: 'foo',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 5, endRow: 5, document: 'a/foo.siren' },
      },
      {
        type: 'task',
        id: 'task-b',
        attributes: [],
        origin: { startByte: 2, endByte: 3, startRow: 9, endRow: 9, document: 'b/foo.siren' },
      },
    ]);

    expect(env.graph.resources.map((resource) => [resource.type, resource.id])).toEqual([
      ['milestone', 'foo'],
      ['task', 'task-b'],
    ]);
    expect(env.diagnostics).toEqual([
      {
        code: 'W003',
        severity: 'warning',
        resourceId: 'foo',
        resourceType: 'milestone',
        file: 'b/foo.siren',
        firstFile: 'a/foo.siren',
        firstLine: 6,
        firstColumn: 0,
        secondLine: 1,
        secondColumn: 0,
      },
    ]);
  });

  it('resolves references to synthetic milestones from other files without W002', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'prepare',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 0, endRow: 0, document: 'foo.siren' },
      },
      {
        type: 'task',
        id: 'ship',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'foo' } }],
        origin: { startByte: 2, endByte: 3, startRow: 0, endRow: 0, document: 'bar.siren' },
      },
    ]);

    expect(env.graph.hasResource('foo')).toBe(true);
    expect(env.diagnostics.filter((diagnostic) => diagnostic.code === 'W002')).toEqual([]);
  });

  it('resolves references to synthetic ids derived from filenames with spaces', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'plan-task',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 0, endRow: 0, document: 'road map.siren' },
      },
      {
        type: 'task',
        id: 'followup',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'road map' } }],
        origin: { startByte: 2, endByte: 3, startRow: 1, endRow: 1, document: 'next.siren' },
      },
    ]);

    expect(env.graph.getResource('road map')?.synthetic).toBe(true);
    expect(env.diagnostics.filter((diagnostic) => diagnostic.code === 'W002')).toEqual([]);
  });

  it('keeps synthetic milestones draft even when all dependencies are complete', () => {
    const env = runIRBuildPipeline([
      {
        type: 'task',
        id: 'done',
        status: 'complete',
        attributes: [],
        origin: { startByte: 0, endByte: 1, startRow: 0, endRow: 0, document: 'release.siren' },
      },
    ]);

    expect(env.graph.getResource('done')?.status).toBe('complete');
    expect(env.graph.getResource('release')?.synthetic).toBe(true);
    expect(env.graph.getResource('release')?.status).toBe('draft');
  });
});

describe('IR pipeline redundancy regression', () => {
  it('builds ResourceGraph exactly twice per SirenBuilder.build()', () => {
    const buildSpy = vi.spyOn(ResourceGraph, 'fromResources');

    try {
      const assembly = SirenBuilder.fromResources([
        { type: 'task', id: 'task-a', status: 'complete', attributes: [] },
        { type: 'task', id: 'task-b', status: 'complete', attributes: [] },
        {
          type: 'milestone',
          id: 'release',
          attributes: [
            {
              key: 'depends_on',
              value: {
                kind: 'array',
                elements: [
                  { kind: 'reference', id: 'task-a' },
                  { kind: 'reference', id: 'task-b' },
                ],
              },
            },
          ],
        },
      ]);

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
