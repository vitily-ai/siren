import { describe, expect, it } from 'vitest';
import { IRContext, type Resource, version } from './index.js';

describe('@siren/core', () => {
  it('exports version', () => {
    expect(version).toBe('0.1.0');
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no resources', () => {
      const ir = IRContext.fromResources([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
      ];
      const ir = IRContext.fromResources(resources);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
        { type: 'milestone', id: 'milestone2', complete: true, attributes: [] },
      ];
      const ir = IRContext.fromResources(resources);
      expect(ir.getMilestoneIds()).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no resources', () => {
    const ir = IRContext.fromResources([]);
    expect(ir.getTasksByMilestone()).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
    ];
    const ir = IRContext.fromResources(resources);
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
    const ir = IRContext.fromResources(resources);
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
    const ir = IRContext.fromResources(resources);
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
    const ir = IRContext.fromResources(resources);
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
    const ir = IRContext.fromResources(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });
});
