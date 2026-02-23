import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:empty-files', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('handles empty files gracefully', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'empty-files');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(milestoneIds).toEqual([]);
  });
});
