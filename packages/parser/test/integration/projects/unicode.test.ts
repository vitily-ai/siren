import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:unicode', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('handles unicode milestone names', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'unicode');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(
      new Set(['🚀 Launch', '日本語マイルストーン', 'émojis-and-accénts']),
    );
  });
});
