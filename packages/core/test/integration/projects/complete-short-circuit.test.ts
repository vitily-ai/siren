import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../../src/ir/context.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('short circuit defect is fixed', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'complete-short-circuit');
    resources = decoded.resources;
  });

  it('excludes complete tasks from dependency tree', () => {
    // Fixture structure:
    // milestone ms depends on: [complete-and-should-not-show (complete), incomplete-and-should-show (incomplete)]
    // incomplete-and-should-show depends on: complete-and-should-not-show (complete)

    const complete = resources.find((r) => r.id === 'complete-and-should-not-show');
    const incomplete = resources.find((r) => r.id === 'incomplete-and-should-show');
    const root = resources.find((r) => r.id === 'ms');

    expect(complete).toBeDefined();
    expect(incomplete).toBeDefined();
    expect(root).toBeDefined();

    // Verify fixture complete flags are correct
    expect(complete!.complete).toBe(true);
    expect(incomplete!.complete).toBe(false);

    // Calculate dependency tree of root using IRContext
    const irContext = IRContext.fromResources(resources);
    const tree = irContext.getDependencyTree('ms');

    // ACCEPTANCE CRITERIA:
    // When getDependencyTree uses an expandPredicate that returns false for complete tasks,
    // those complete tasks should NOT appear in the tree at all.

    // Expected tree structure:
    // ms
    //   └─ incomplete-and-should-show (no children because its dependency is complete)

    // The tree should only have 1 dependency: incomplete-and-should-show
    // complete-and-should-not-show should be excluded because it is complete
    expect(tree.dependencies).toHaveLength(1);

    const incompleteDep = tree.dependencies.find(
      (d) => d.resource.id === 'incomplete-and-should-show',
    );
    expect(incompleteDep).toBeDefined();

    // complete-and-should-not-show should NOT be in the tree because it's complete
    const completeDep = tree.dependencies.find(
      (d) => d.resource.id === 'complete-and-should-not-show',
    );
    expect(completeDep).toBeUndefined();

    // incomplete-and-should-show should have no dependencies shown because its only dependency is complete
    expect(incompleteDep!.dependencies).toHaveLength(0);
  });
});
