import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:list-with-broken-and-valid', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('skips broken and includes valid milestone', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'list-with-broken-and-valid');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['test', 'valid']));
  });
});
