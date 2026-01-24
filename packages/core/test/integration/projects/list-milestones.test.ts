import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:list-milestones', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes milestones alpha and beta', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'list-milestones');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['alpha', 'beta']));
  });
});
