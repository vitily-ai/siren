import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:tasks-by-milestone', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes tasks and milestones mapping', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'tasks-by-milestone');
    const milestones = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    const tasks = resources.filter((r) => r.type === 'task').map((r) => r.id);
    expect(milestones).toContain('alpha');
    expect(milestones).toContain('beta');
    expect(tasks).toContain('task1');
  });
});
