import { describe, expect, it } from 'vitest';
import { getMilestoneIds, type Resource, version } from './index.js';

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
});
