import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:deep-nested', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('finds milestones in deep nested dirs', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'deep-nested');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['root', 'level1', 'deep']));
  });
});
