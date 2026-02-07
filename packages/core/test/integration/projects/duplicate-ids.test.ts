import { beforeAll, describe, expect, it } from 'vitest';
import { getIncompleteLeafDependencyChains } from '../../../src/utilities/dependency-chains.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:duplicate-ids (anonymized)', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'complete-short-circuit');
    resources = decoded.resources;
  });

  it('decodes fixture and returns dependency chains (intended behavior)', () => {
    const determine = resources.find((r) => r.id === 'determine-source');
    const root = resources.find((r) => r.id === 'duplicate-ids');

    expect(determine).toBeDefined();
    expect(root).toBeDefined();

    // The determine_source task should be marked complete in the fixture
    expect(determine!.complete).toBe(true);

    // Intended behavior: core should return computed dependency chains for
    // the root even when some intermediate nodes are marked `complete`.
    const chains = getIncompleteLeafDependencyChains('duplicate-ids', resources);
    expect(chains.length).toBeGreaterThan(0);
    // At least one chain should include deeper nodes (length >= 3)
    expect(chains.some((c) => c.length >= 3)).toBe(true);
  });
});
