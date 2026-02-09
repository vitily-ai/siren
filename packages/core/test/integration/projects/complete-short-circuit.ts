import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper.js';

describe('project:duplicate-ids (anonymized)', () => {
  let adapter: any;
  let resources: any[];

  beforeAll(async () => {
    adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'complete-short-circuit');
    resources = decoded.resources;
  });

  it('decodes fixture and returns dependency tree showing incompletes', () => {
    const determine = resources.find((r) => r.id === 'determine-source');
    const root = resources.find((r) => r.id === 'duplicate-ids');

    expect(determine).toBeDefined();
    expect(root).toBeDefined();

    // The determine_source task should be marked complete in the fixture
    expect(determine!.complete).toBe(true);
  });
});
