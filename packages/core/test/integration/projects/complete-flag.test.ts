import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../../src/index.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:complete-flag', () => {
  let adapter: any;
  let resources: any[];
  let irContext: IRContext;

  beforeAll(async () => {
    adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'complete-flag');
    resources = decoded.resources;
    irContext = IRContext.fromResources(resources);
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
    // and an incomplete task. The dependency tree includes all dependencies but
    // marks completed tasks so they can be filtered during rendering.
    const tree = irContext.getDependencyTree('milestone1');

    // Milestone should have task_root as a dependency
    expect(tree.dependencies).toHaveLength(1);
    expect(tree.dependencies[0]?.resource.id).toBe('task_root');

    const taskRootNode = tree.dependencies[0];
    // task_root should only have incomplete dependencies (complete tasks are filtered by core)
    expect(taskRootNode?.dependencies).toHaveLength(1);

    // Find the incomplete task in the dependencies
    const incompleteDep = taskRootNode?.dependencies.find(
      (d) => d.resource.id === 'task_incomplete',
    );

    expect(incompleteDep).toBeDefined();

    // Verify the incomplete task has the correct complete flag
    expect(incompleteDep!.resource.complete).toBe(false);

    // Complete tasks should not appear in the tree at all
    const completeDep = taskRootNode?.dependencies.find((d) => d.resource.id === 'task_done');
    expect(completeDep).toBeUndefined();
  });
});
