import { describe, expect, it } from 'vitest';
import { ResourceGraph } from '../ir/resource-graph';
import type { Resource } from '../ir/types';

// helpers to build IR-compatible values
const ref = (id: string) => ({ kind: 'reference' as const, id });
const arr = (elements: ReturnType<typeof ref>[]) => ({ kind: 'array' as const, elements });
const attr = (key: string, value: ReturnType<typeof ref> | ReturnType<typeof arr>) => ({
  key,
  value,
});
const res = (id: string, dependsOn?: string[] | string): Resource => ({
  type: 'task',
  id,
  complete: false,
  attributes: dependsOn
    ? [
        attr(
          'depends_on',
          Array.isArray(dependsOn) ? arr(dependsOn.map((d) => ref(d))) : ref(dependsOn),
        ),
      ]
    : [],
});

describe('ResourceGraph.getDependencyTree', () => {
  it('builds a simple linear chain', () => {
    const resources = [res('A', 'B'), res('B', 'C'), res('C')];
    const tree = ResourceGraph.fromResources(resources).getDependencyTree('A');

    expect(tree.resource.id).toBe('A');
    expect(tree.dependencies).toHaveLength(1);
    const b = tree.dependencies[0]!;
    expect(b.resource.id).toBe('B');
    expect(b.dependencies).toHaveLength(1);
    const c = b.dependencies[0]!;
    expect(c.resource.id).toBe('C');
    expect(c.dependencies).toHaveLength(0);
  });

  it('supports branching dependencies', () => {
    const resources = [res('A', ['B', 'C']), res('B'), res('C')];
    const tree = ResourceGraph.fromResources(resources).getDependencyTree('A');

    expect(tree.dependencies.map((d) => d.resource.id).sort()).toEqual(['B', 'C']);
  });

  it('honors traversePredicate (treats node as leaf with explicit control)', () => {
    const resources = [res('A', 'B'), res('B', 'C'), res('C')];
    const tree = ResourceGraph.fromResources(resources).getDependencyTree('A', (r) =>
      r.id === 'B' ? { include: true, expand: false } : true,
    );

    expect(tree.dependencies).toHaveLength(1);
    const b = tree.dependencies[0]!;
    expect(b.resource.id).toBe('B');
    // B should be a leaf because predicate returned { include: true, expand: false }
    expect(b.dependencies).toHaveLength(0);
  });

  it('detects cycles and inserts a cycle sentinel', () => {
    const resources = [res('A', 'B'), res('B', 'C'), res('C', 'A')];
    const tree = ResourceGraph.fromResources(resources).getDependencyTree('A');

    // A -> B -> C -> (cycle node for A)
    expect(tree.resource.id).toBe('A');
    const b = tree.dependencies[0]!;
    expect(b.resource.id).toBe('B');
    const c = b.dependencies[0]!;
    expect(c.resource.id).toBe('C');
    expect(c.dependencies).toHaveLength(1);
    const cycleNode = c.dependencies[0]!;
    expect(cycleNode.cycle).toBeTruthy();
    expect(cycleNode.resource.id).toBe('A');
  });

  it('marks missing referenced resources with missing=true', () => {
    const resources = [res('A', 'X')]; // X not present
    const tree = ResourceGraph.fromResources(resources).getDependencyTree('A');

    expect(tree.dependencies).toHaveLength(1);
    const missing = tree.dependencies[0]!;
    expect(missing.resource.id).toBe('X');
    expect(missing.missing).toBeTruthy();
    expect(missing.dependencies).toHaveLength(0);
  });
});
