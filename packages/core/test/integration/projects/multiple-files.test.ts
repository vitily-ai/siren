import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:multiple-files', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes milestones from multiple files', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'multiple-files');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['alpha', 'beta', 'a', 'b']));
  });
});
