import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:multiple-parse-errors', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes valid milestone when other files are broken', async () => {
    const { resources } = await parseAndDecodeAll(adapter, 'multiple-parse-errors');
    const milestoneIds = resources.filter((r) => r.type === 'milestone').map((r) => r.id);
    expect(milestoneIds).toEqual(['valid']);
  });
});
