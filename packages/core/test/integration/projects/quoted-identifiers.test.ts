import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:quoted-identifiers', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('handles quoted milestone identifiers', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'quoted-identifiers');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(new Set(milestoneIds)).toEqual(new Set(['Q1 Launch', 'MVP Release', 'quoted']));
  });
});
