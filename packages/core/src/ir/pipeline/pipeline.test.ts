import { describe, expect, it, vi } from 'vitest';
import * as milestoneUtils from '../../utilities/milestone';
import { IRAssembly } from '../assembly';
import type { Resource } from '../types';
import { runIRBuildPipeline } from './index';

describe('runIRBuildPipeline', () => {
  it('produces resources, graph, resourcesById, and ordered diagnostics for a representative project', () => {
    const resources: readonly Resource[] = [
      // duplicate ids → W003
      { type: 'task', id: 'dup', complete: false, attributes: [] },
      { type: 'task', id: 'dup', complete: true, attributes: [] },
      // dangling dep → W002
      {
        type: 'task',
        id: 'has-dangling',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
      },
      // cycle → W001
      {
        type: 'task',
        id: 'cycle-a',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
      },
      {
        type: 'task',
        id: 'cycle-b',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
      },
      // implicit completion candidate
      { type: 'task', id: 'finished', complete: true, attributes: [] },
      {
        type: 'milestone',
        id: 'release',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'finished' } }],
      },
    ];

    const env = runIRBuildPipeline(resources);

    expect(env.resources.map((r) => [r.id, r.complete])).toEqual([
      ['dup', false],
      ['has-dangling', false],
      ['cycle-a', false],
      ['cycle-b', false],
      ['finished', true],
      ['release', true],
    ]);

    const codes = env.diagnostics.map((d) => d.code);
    // W001 → W002 → W003 ordering
    expect(codes).toEqual(['W001', 'W002', 'W003']);

    expect(env.graph.getNodes()).toEqual(
      expect.arrayContaining(['dup', 'has-dangling', 'cycle-a', 'cycle-b', 'finished', 'release']),
    );

    expect(env.resourcesById.get('release')?.complete).toBe(true);
  });
});

describe('IR pipeline redundancy regression', () => {
  it('builds the dependency graph exactly once per IRAssembly.build()', () => {
    const buildSpy = vi.spyOn(milestoneUtils, 'buildDependencyGraph');

    try {
      const assembly = IRAssembly.fromResources([
        { type: 'task', id: 'task-a', complete: true, attributes: [] },
        { type: 'task', id: 'task-b', complete: true, attributes: [] },
        {
          type: 'milestone',
          id: 'release',
          complete: false,
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

      // The pipeline must build the graph exactly once during build().
      // Prior to the pipeline refactor this was 2-3 times: once inside
      // resolveImplicitMilestoneCompletion, once in normalizeResources, and
      // again inside getTasksByMilestone / getDependencyTree on each query.
      expect(buildSpy).toHaveBeenCalledTimes(1);

      // Cached graph is reused for query helpers — no additional builds.
      ctx.getDependencyTree('release');
      ctx.getTasksByMilestone();
      expect(buildSpy).toHaveBeenCalledTimes(1);
    } finally {
      buildSpy.mockRestore();
    }
  });
});
