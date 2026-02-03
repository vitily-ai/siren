import { beforeAll, describe, expect, it } from 'vitest';
import { isArray, isReference } from '../../../src/ir/types.js';
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

describe('project:deep-dependencies', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('decodes deep dependency chains correctly', async () => {
    const { resources, diagnostics } = await parseAndDecodeAll(adapter, 'deep-dependencies');

    // Should have 17 tasks + 2 milestones = 19 resources
    expect(resources).toHaveLength(19);

    // Check that deep chains are present
    const task10 = resources.find((r) => r.id === 'task10');
    expect(task10).toBeDefined();
    expect(getDependsOn(task10!)).toContain('task9');

    const task1 = resources.find((r) => r.id === 'task1');
    expect(task1).toBeDefined();
    expect(getDependsOn(task1!)).toHaveLength(0); // No dependencies

    // Check milestone dependencies
    const milestone1 = resources.find((r) => r.id === 'milestone1');
    expect(milestone1).toBeDefined();
    expect(getDependsOn(milestone1!)).toContain('task10');

    // Check multiple branches
    const taskA = resources.find((r) => r.id === 'taskA');
    expect(taskA).toBeDefined();
    const depsA = getDependsOn(taskA!);
    expect(depsA).toContain('taskB');
    expect(depsA).toContain('taskC');

    // Check for cycle warnings
    const cycleWarnings = diagnostics.filter((d) => d.code === 'W004' && d.severity === 'warning');
    expect(cycleWarnings).toHaveLength(1); // One cycle: cycleX -> cycleY -> cycleZ -> cycleX
  });
});
