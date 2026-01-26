import { beforeAll, describe, expect, it } from 'vitest';
import { getIncompleteLeafDependencyChains } from '../../../src/utilities/dependency-chains.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:complete-flag', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'complete-flag');
    resources = decoded.resources;
  });

  it('decodes fixture and respects completed tasks (complete = true)', () => {
    const taskDone = resources.find((r) => r.id === 'task_done');
    const taskRoot = resources.find((r) => r.id === 'task_root');
    const milestone = resources.find((r) => r.id === 'milestone1');

    expect(taskDone).toBeDefined();
    expect(taskRoot).toBeDefined();
    expect(milestone).toBeDefined();

    // task_done should be marked complete
    expect(taskDone!.complete).toBe(true);

    // The milestone depends on task_root, which depends on both a completed task
    // and an incomplete task. Only the incomplete leaf should be collected.
    const chains = getIncompleteLeafDependencyChains('milestone1', resources, 10);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(['milestone1', 'task_root', 'task_incomplete']);
  });
});
