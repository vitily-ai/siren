import { describe, expect, it } from 'vitest';
import { getMilestoneIds, getTasksByMilestone, type Resource, version } from './index.js';

describe('@siren/core', () => {
  it('exports version', () => {
    expect(version).toBe('0.1.0');
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no resources', () => {
      expect(getMilestoneIds([])).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
      ];
      expect(getMilestoneIds(resources)).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', complete: false, attributes: [] },
        { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
        { type: 'task', id: 'task2', complete: true, attributes: [] },
        { type: 'milestone', id: 'milestone2', complete: true, attributes: [] },
      ];
      expect(getMilestoneIds(resources)).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no resources', () => {
    expect(getTasksByMilestone([])).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
    ];
    const result = getTasksByMilestone(resources);
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
      {
        type: 'task',
        id: 'task1',
        complete: true,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'milestone1' } }],
      },
    ];
    const result = getTasksByMilestone(resources);
    expect(result.get('milestone1')).toEqual([]);
  });

  it('includes incomplete tasks that depend on milestone', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      complete: false,
      attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'milestone1' } }],
    };
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
      task,
    ];
    const result = getTasksByMilestone(resources);
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('handles array depends_on', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      complete: false,
      attributes: [
        {
          key: 'depends_on',
          value: {
            kind: 'array',
            elements: [
              { kind: 'reference', id: 'milestone1' },
              { kind: 'reference', id: 'other' },
            ],
          },
        },
      ],
    };
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
      task,
    ];
    const result = getTasksByMilestone(resources);
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('ignores tasks that depend on non-milestones', () => {
    const resources: Resource[] = [
      { type: 'milestone', id: 'milestone1', complete: false, attributes: [] },
      {
        type: 'task',
        id: 'task1',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'other_task' } }],
      },
    ];
    const result = getTasksByMilestone(resources);
    expect(result.get('milestone1')).toEqual([]);
  });
});
