import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:array-depends', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes array depends_on into resources', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'array-depends');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['alpha', 'gamma']));
    const tasks = resources.filter((r) => r.type === 'task').map((r) => r.id);
    expect(tasks).toContain('task1');
  });
});
