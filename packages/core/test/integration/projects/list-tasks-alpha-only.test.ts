import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:list-tasks-alpha-only', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('has task1 under alpha when listing tasks', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'list-tasks-alpha-only');
    const tasks = resources.filter((r) => r.type === 'task').map((r) => r.id);
    expect(tasks).toContain('task1');
  });
});
