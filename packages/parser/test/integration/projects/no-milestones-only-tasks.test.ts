import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:no-milestones-only-tasks', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('finds no milestones when only tasks exist', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'no-milestones-only-tasks');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(milestoneIds).toEqual([]);
  });
});
