import { IRContext } from '@sirenpm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

describe('project:milestone-implicit-complete', () => {
  let irContext: IRContext;

  beforeAll(async () => {
    const adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'milestone-implicit-complete');
    irContext = IRContext.fromResources(decoded.resources);
  });

  it('resolves .complete to true on a milestone whose all direct deps are complete', () => {
    const mDone = irContext.findResourceById('m-done');
    expect(mDone.complete).toBe(true);
  });

  it('resolves .complete transitively through milestone chains', () => {
    const root = irContext.findResourceById('root');
    expect(root.complete).toBe(true);
  });

  it('preserves .complete on explicitly-complete tasks', () => {
    const taskA = irContext.findResourceById('task-a');
    expect(taskA.complete).toBe(true);
  });

  it('excludes implicitly-complete milestones from getDependencyTree', () => {
    // root depends on m-done which is implicitly complete — tree should be empty
    const tree = irContext.getDependencyTree('root');
    expect(tree.dependencies).toHaveLength(0);
  });

  it('excludes explicitly-complete deps from a milestone dependency tree', () => {
    // m-done depends on task-a which is explicitly complete — tree should be empty
    const tree = irContext.getDependencyTree('m-done');
    expect(tree.dependencies).toHaveLength(0);
  });
});

describe('project:milestone-orphan-not-complete', () => {
  let irContext: IRContext;

  beforeAll(async () => {
    const adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'milestone-orphan-not-complete');
    irContext = IRContext.fromResources(decoded.resources);
  });

  it('does not resolve .complete on an orphan milestone with no depends_on', () => {
    const orphan = irContext.findResourceById('orphan');
    expect(orphan.complete).toBe(false);
  });

  it('orphan milestone still appears in the dependency tree of resources that depend on it', () => {
    const tree = irContext.getDependencyTree('t');
    expect(tree.dependencies).toHaveLength(1);
    expect(tree.dependencies[0]?.resource.id).toBe('orphan');
  });
});
