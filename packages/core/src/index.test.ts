import { describe, expect, it } from 'vitest';
import { IRAssembly, IRContext, type Resource, version } from './index';

function buildContext(resources: readonly Resource[]) {
  return IRAssembly.fromResources(resources).build();
}

describe('@sirenpm/core', () => {
  it('exports version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports IRAssembly', () => {
    expect(IRAssembly.fromResources([]).resources).toEqual([]);
  });

  it('exports IRContext and builds it through IRAssembly', () => {
    const context = buildContext([]);
    expect(context).toBeInstanceOf(IRContext);
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no resources', () => {
      const ir = buildContext([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
      ];
      const ir = buildContext(resources);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
        { type: 'milestone', id: 'milestone2', complete: true, attributes: [] },
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
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task1' } }],
      },
      {
        type: 'task',
        id: 'task1',
        complete: true,
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
      complete: false,
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        complete: false,
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
      complete: false,
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        complete: false,
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
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'other_milestone' } }],
      },
      {
        type: 'task',
        id: 'task1',
        complete: false,
        attributes: [],
      },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });
});
