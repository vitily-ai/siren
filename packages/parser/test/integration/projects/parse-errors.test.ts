import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:parse-errors', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('skips broken files and yields valid milestone', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'parse-errors');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(milestoneIds).toEqual(['valid']);
  });
});
