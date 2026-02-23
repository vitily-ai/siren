import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:loaded-project', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('loads simple project', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'loaded-project');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(milestoneIds).toEqual(['test']);
  });
});
