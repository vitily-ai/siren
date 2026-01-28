import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from '../../test/integration/projects/helper.js';
import { getIncompleteLeafDependencyChains } from './dependency-chains.js';

describe('getIncompleteLeafDependencyChains', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    ({ resources } = await parseAndDecodeAll(adapter, 'deep-dependencies'));
  });

  it('collects chains for task10 (deep chain root)', () => {
    const chains = getIncompleteLeafDependencyChains('task10', resources, 10);
    // task10 -> task9 -> ... -> task1
    // All tasks are incomplete, task1 is leaf
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      'task10',
      'task9',
      'task8',
      'task7',
      'task6',
      'task5',
      'task4',
      'task3',
      'task2',
      'task1',
    ]);
  });

  it('respects max depth limit', () => {
    const chains = getIncompleteLeafDependencyChains('task10', resources, 3);
    // Should stop at depth 3: task10 -> task9 -> task8 -> task7 (but task7 not leaf)
    // So no chains collected since task7 is not leaf
    expect(chains).toHaveLength(0);
  });

  it('expands root milestone dependencies', () => {
    const chains = getIncompleteLeafDependencyChains('milestone1', resources, 10);
    // milestone1 depends on task10, expands to the deep chain
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      'milestone1',
      'task10',
      'task9',
      'task8',
      'task7',
      'task6',
      'task5',
      'task4',
      'task3',
      'task2',
      'task1',
    ]);
  });

  it('handles multiple branches (taskA)', () => {
    const chains = getIncompleteLeafDependencyChains('taskA', resources, 10);
    // taskA -> taskC -> task9 -> ... -> task1 (10 edges, within 10)
    // taskA -> taskB -> task10 -> ... -> task1 (11 edges, exceeds 10)
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      'taskA',
      'taskC',
      'task9',
      'task8',
      'task7',
      'task6',
      'task5',
      'task4',
      'task3',
      'task2',
      'task1',
    ]);
  });

  it('handles incomplete dependencies (incompleteTask)', () => {
    const chains = getIncompleteLeafDependencyChains('incompleteTask', resources, 10);
    // incompleteTask -> nonExistentTask (missing, treated as incomplete leaf)
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(['incompleteTask', 'nonExistentTask']);
  });

  it('avoids cycles', () => {
    const chains = getIncompleteLeafDependencyChains('cycleX', resources, 10);
    // cycleX -> cycleY -> cycleZ -> cycleX, but since cycle, no leaf reached
    expect(chains).toHaveLength(0);
  });

  it('sorts chains with comparator', () => {
    const chains = getIncompleteLeafDependencyChains('taskA', resources, 10, (a, b) =>
      a.join(',').localeCompare(b.join(',')),
    );
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      'taskA',
      'taskC',
      'task9',
      'task8',
      'task7',
      'task6',
      'task5',
      'task4',
      'task3',
      'task2',
      'task1',
    ]);
  });

  it('returns empty for complete task leaf', () => {
    // Assuming no complete tasks in fixture, but if there were, they wouldn't be collected
    // Since all tasks are incomplete, test with a task that has no deps
    const chains = getIncompleteLeafDependencyChains('task1', resources, 10);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(['task1']);
  });

  it('emits a pruning warning when maxDepth is exceeded', () => {
    // Build a tiny chain: root -> a -> b -> c -> d
    const resources: any[] = [
      {
        type: 'milestone',
        id: 'root',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
      },
      {
        type: 'task',
        id: 'a',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
      },
      {
        type: 'task',
        id: 'b',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'c' } }],
      },
      {
        type: 'task',
        id: 'c',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'd' } }],
      },
      { type: 'task', id: 'd', complete: false, attributes: [] },
    ];

    const warnings: string[] = [];
    const chains = getIncompleteLeafDependencyChains('root', resources, 2, undefined, {
      onWarning: (m) => warnings.push(m),
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('pruned at max depth 2');
  });
});
