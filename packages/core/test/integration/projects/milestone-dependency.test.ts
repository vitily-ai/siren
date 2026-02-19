import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../../src/ir/context.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:milestone-dependency', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    ({ resources } = await parseAndDecodeAll(adapter, 'milestone-dependency'));
  });

  it('decodes the expected milestones', () => {
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['shows_as_leaf_dep_of_root', 'root', 'main']));
  });

  it('treats milestone dependencies as leaves when expanded from a root milestone', () => {
    const context = IRContext.fromResources(resources);
    const tree = context.getDependencyTree('root');

    // root -> shows_as_root_dep (task) -> shows_as_leaf_dep_of_root (milestone)
    expect(tree.resource.id).toBe('root');
    expect(tree.dependencies).toHaveLength(1);
    const showsAsRootDep = tree.dependencies[0];
    expect(showsAsRootDep.resource.id).toBe('shows_as_root_dep');
    expect(showsAsRootDep.dependencies).toHaveLength(1);
    const leafMilestone = showsAsRootDep.dependencies[0];
    expect(leafMilestone.resource.id).toBe('shows_as_leaf_dep_of_root');
    // milestone should be treated as a leaf (not expanded to show its depends_on)
    expect(leafMilestone.dependencies).toHaveLength(0);
  });
});
