import { beforeAll, describe, expect, it } from 'vitest';
import { isArray, isReference } from '../../../src/ir/index.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

function getDependsOn(resource: any): string[] {
  const attr = resource.attributes.find((a: any) => a.key === 'depends_on');
  if (!attr) return [];

  const value = attr.value;
  if (isReference(value)) {
    return [value.id];
  }
  if (isArray(value)) {
    return value.elements.filter(isReference).map((ref: any) => ref.id);
  }
  return [];
}

describe('project:incomplete-leaf-rendering', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes fixture and verifies completed dependency is present but has no deps', async () => {
    const { resources, diagnostics } = await parseAndDecodeAll(
      adapter,
      'incomplete-leaf-rendering',
    );

    // Expect 5 resources defined in the fixture
    expect(resources).toHaveLength(5);

    const parent = resources.find((r) => r.id === 'm_parent');
    expect(parent).toBeDefined();
    const deps = getDependsOn(parent!);
    expect(deps).toContain('dep_a');

    const depA = resources.find((r) => r.id === 'dep_a');
    expect(depA).toBeDefined();
    // dep_a is marked complete and has no dependencies
    expect(depA?.complete).toBe(true);
    expect(getDependsOn(depA!)).toHaveLength(0);
  });
});
