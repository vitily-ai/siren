import { describe, expect, it } from 'vitest';
import { type Resource, SirenBuilder, SirenProject, version } from './index';

function buildContext(resources: readonly Resource[]) {
  return SirenBuilder.fromResources(resources).build();
}

describe('@sirenpm/core', () => {
  it('exports version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports SirenBuilder', () => {
    expect(SirenBuilder.fromResources([]).resources).toEqual([]);
  });

  it('exports SirenProject and builds it through SirenBuilder', () => {
    const context = buildContext([]);
    expect(context).toBeInstanceOf(SirenProject);
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no resources', () => {
      const ir = buildContext([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(resources);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'milestone', id: 'milestone1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
        { type: 'milestone', id: 'milestone2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(resources);
      expect(ir.getMilestoneIds()).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no resources', () => {
    const ir = buildContext([]);
    expect(ir.getTasksByMilestone()).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const resources: Resource[] = [{ type: 'milestone', id: 'milestone1', attributes: [] }];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task1' } }],
      },
      {
        type: 'task',
        id: 'task1',
        status: 'complete',
        attributes: [],
      },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('includes incomplete tasks that the milestone depends on', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task1' } }],
      },
      task,
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('handles array depends_on', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [
          {
            key: 'depends_on',
            value: {
              kind: 'array',
              elements: [
                { kind: 'reference', id: 'task1' },
                { kind: 'reference', id: 'other' },
              ],
            },
          },
        ],
      },
      task,
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('ignores dependencies that are not tasks', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'other_milestone' } }],
      },
      {
        type: 'task',
        id: 'task1',
        attributes: [],
      },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });
});
