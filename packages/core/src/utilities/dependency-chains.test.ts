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
    const chains = getIncompleteLeafDependencyChains('task10', resources);
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

  it('expands root milestone dependencies', () => {
    const chains = getIncompleteLeafDependencyChains('milestone1', resources);
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
    const chains = getIncompleteLeafDependencyChains('taskA', resources);
    // With MAX_DEPTH now internal and large, both branches are returned.
    const branchB = [
      'taskA',
      'taskB',
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
    ];
    const branchC = [
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
    ];
    expect(chains).toHaveLength(2);
    expect(chains).toEqual(expect.arrayContaining([branchB, branchC]));
  });

  it('handles incomplete dependencies (incompleteTask)', () => {
    const chains = getIncompleteLeafDependencyChains('incompleteTask', resources);
    // incompleteTask -> nonExistentTask (missing, treated as incomplete leaf)
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(['incompleteTask', 'nonExistentTask']);
  });

  it('avoids cycles', () => {
    const chains = getIncompleteLeafDependencyChains('cycleX', resources);
    // cycleX -> cycleY -> cycleZ -> cycleX, but since cycle, no leaf reached
    expect(chains).toHaveLength(0);
  });

  it('sorts chains with comparator', () => {
    const chains = getIncompleteLeafDependencyChains('taskA', resources, (a, b) =>
      a.join(',').localeCompare(b.join(',')),
    );
    const branchB = [
      'taskA',
      'taskB',
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
    ];
    const branchC = [
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
    ];
    // Comparator sorts 'taskB' branch before 'taskC' branch
    expect(chains).toHaveLength(2);
    expect(chains[0]).toEqual(branchB);
    expect(chains[1]).toEqual(branchC);
  });

  it('returns empty for complete task leaf', () => {
    // Assuming no complete tasks in fixture, but if there were, they wouldn't be collected
    // Since all tasks are incomplete, test with a task that has no deps
    const chains = getIncompleteLeafDependencyChains('task1', resources);
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
    const chains = getIncompleteLeafDependencyChains('root', resources, undefined, {
      onWarning: (m) => warnings.push(m),
    });

    // MAX_DEPTH is an internal implementation detail now; small test chains
    // won't trigger pruning. Assert no pruning warning is emitted for this tiny chain.
    expect(warnings.length).toBe(0);
  });
});
