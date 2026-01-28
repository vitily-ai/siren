import { beforeAll, describe, expect, it } from 'vitest';
import { getIncompleteLeafDependencyChains } from '../../../src/utilities/dependency-chains.js';
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
    expect(new Set(milestoneIds)).toEqual(new Set(['shows_as_leaf_dep_of_root', 'root']));
  });

  it('treats milestone dependencies as leaves when expanded from a root milestone', () => {
    const chains = getIncompleteLeafDependencyChains('root', resources);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual(['root', 'shows_as_root_dep', 'shows_as_leaf_dep_of_root']);
  });

  it('does not expand the inner milestone when listing root dependencies', () => {
    const innerChains = getIncompleteLeafDependencyChains('shows_as_leaf_dep_of_root', resources);
    expect(innerChains).toHaveLength(1);
    expect(innerChains[0]).toEqual(['shows_as_leaf_dep_of_root', 'does_not_show_as_root_dep']);
  });
});
