import { describe, expect, it } from 'vitest';
import {
  deduplicateResources,
  indexResourcesById,
  normalizeResources,
  resolveImplicitMilestoneCompletion,
} from './normalization';
import type { Resource } from './types';

describe('deduplicateResources', () => {
  it('keeps the first occurrence of each id and drops later duplicates', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'a', complete: false, attributes: [] },
      { type: 'task', id: 'b', complete: false, attributes: [] },
      { type: 'task', id: 'a', complete: true, attributes: [] },
      { type: 'task', id: 'b', complete: true, attributes: [] },
      { type: 'task', id: 'a', complete: true, attributes: [] },
    ];

    const deduplicated = deduplicateResources(resources);

    expect(deduplicated.map((r) => [r.id, r.complete])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });

  it('returns a frozen array', () => {
    const deduplicated = deduplicateResources([
      { type: 'task', id: 'a', complete: false, attributes: [] },
    ]);
    expect(Object.isFrozen(deduplicated)).toBe(true);
  });

  it('returns an empty frozen array for empty input', () => {
    const deduplicated = deduplicateResources([]);
    expect(deduplicated).toEqual([]);
    expect(Object.isFrozen(deduplicated)).toBe(true);
  });
});

describe('resolveImplicitMilestoneCompletion', () => {
  it('promotes a milestone to complete when every dependency is already complete', () => {
    const resources: Resource[] = [
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
    ];

    const resolved = resolveImplicitMilestoneCompletion(resources);

    expect(resolved.find((r) => r.id === 'release')?.complete).toBe(true);
  });

  it('does not promote a milestone when any dependency is incomplete', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'task-a', complete: true, attributes: [] },
      { type: 'task', id: 'task-b', complete: false, attributes: [] },
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
    ];

    const resolved = resolveImplicitMilestoneCompletion(resources);

    expect(resolved.find((r) => r.id === 'release')?.complete).toBe(false);
  });

  it('does not mutate the input resources', () => {
    const milestone: Resource = {
      type: 'milestone',
      id: 'release',
      complete: false,
      attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task-a' } }],
    };
    const resources: Resource[] = [
      { type: 'task', id: 'task-a', complete: true, attributes: [] },
      milestone,
    ];

    resolveImplicitMilestoneCompletion(resources);

    expect(milestone.complete).toBe(false);
  });

  it('returns a deeply frozen snapshot', () => {
    const resolved = resolveImplicitMilestoneCompletion([
      { type: 'task', id: 'task-a', complete: false, attributes: [] },
    ]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved[0])).toBe(true);
  });
});

describe('indexResourcesById', () => {
  it('indexes resources by id', () => {
    const taskA: Resource = { type: 'task', id: 'a', complete: false, attributes: [] };
    const taskB: Resource = { type: 'task', id: 'b', complete: false, attributes: [] };
    const index = indexResourcesById([taskA, taskB]);

    expect(index.get('a')).toBe(taskA);
    expect(index.get('b')).toBe(taskB);
    expect(index.size).toBe(2);
  });

  it('keeps the last occurrence when ids collide (caller is expected to pre-dedupe)', () => {
    const first: Resource = { type: 'task', id: 'a', complete: false, attributes: [] };
    const second: Resource = { type: 'task', id: 'a', complete: true, attributes: [] };
    const index = indexResourcesById([first, second]);

    expect(index.get('a')).toBe(second);
  });
});

describe('normalizeResources', () => {
  it('deduplicates before resolving implicit completion so a complete duplicate cannot promote a milestone', () => {
    const normalized = normalizeResources([
      { type: 'task', id: 'task-a', complete: false, attributes: [] },
      { type: 'task', id: 'task-a', complete: true, attributes: [] },
      {
        type: 'milestone',
        id: 'release',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task-a' } }],
      },
    ]);

    expect(normalized.resources.find((r) => r.id === 'release')?.complete).toBe(false);
    expect(normalized.resources.find((r) => r.id === 'task-a')?.complete).toBe(false);
  });

  it('exposes a dependency graph reflecting the deduplicated resource set', () => {
    const normalized = normalizeResources([
      { type: 'task', id: 'task-a', complete: false, attributes: [] },
      {
        type: 'milestone',
        id: 'release',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task-a' } }],
      },
    ]);

    expect(normalized.dependencyGraph.getCycles()).toEqual([]);
    expect(normalized.resourcesById.has('release')).toBe(true);
    expect(normalized.resourcesById.has('task-a')).toBe(true);
  });
});
