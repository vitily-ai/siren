import { describe, expect, it } from 'vitest';
import { EntryGraph } from '../ir/entry-graph';
import type { Attribute, EntryReference, SirenEntry } from '../ir/types';

// Tuple-first helpers: depends_on is a Tuple (readonly Atom[]) of references.
// A single-ref dependency is a single-element tuple containing the reference.
// A multi-ref dependency is a multi-element tuple of references.
const ref = (id: string): EntryReference => ({ kind: 'reference', id });

const dependsOnAttr = (deps: string[]): Attribute => ({
  key: 'depends_on',
  value: deps.map(ref),
});

const res = (id: string, dependsOn?: string[] | string): SirenEntry => {
  const deps =
    dependsOn === undefined ? undefined : Array.isArray(dependsOn) ? dependsOn : [dependsOn];
  return {
    type: 'task',
    id,
    attributes: deps ? [dependsOnAttr(deps)] : [],
  };
};

describe('EntryGraph.getDependencyTree (tuple-first depends_on)', () => {
  it('reads a single-element tuple as a single-ref depends_on', () => {
    const entries = [res('A', 'B'), res('B')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');
    expect(tree.entry.id).toBe('A');
    expect(tree.dependencies.map((d) => d.entry.id)).toEqual(['B']);
  });

  it('reads a multi-element tuple as multi-ref depends_on', () => {
    const entries = [res('A', ['B', 'C']), res('B'), res('C')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');
    expect(tree.dependencies.map((d) => d.entry.id).sort()).toEqual(['B', 'C']);
  });

  it('treats an empty tuple depends_on as no dependencies', () => {
    const entries: SirenEntry[] = [
      { type: 'task', id: 'A', attributes: [{ key: 'depends_on', value: [] }] },
    ];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');
    expect(tree.dependencies).toHaveLength(0);
  });

  it('builds a simple linear chain', () => {
    const entries = [res('A', 'B'), res('B', 'C'), res('C')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');

    expect(tree.entry.id).toBe('A');
    expect(tree.dependencies).toHaveLength(1);
    const b = tree.dependencies[0]!;
    expect(b.entry.id).toBe('B');
    expect(b.dependencies).toHaveLength(1);
    const c = b.dependencies[0]!;
    expect(c.entry.id).toBe('C');
    expect(c.dependencies).toHaveLength(0);
  });

  it('supports branching dependencies', () => {
    const entries = [res('A', ['B', 'C']), res('B'), res('C')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');

    expect(tree.dependencies.map((d) => d.entry.id).sort()).toEqual(['B', 'C']);
  });

  it('honors traversePredicate (treats node as leaf with explicit control)', () => {
    const entries = [res('A', 'B'), res('B', 'C'), res('C')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A', (r) =>
      r.id === 'B' ? { include: true, expand: false } : true,
    );

    expect(tree.dependencies).toHaveLength(1);
    const b = tree.dependencies[0]!;
    expect(b.entry.id).toBe('B');
    expect(b.dependencies).toHaveLength(0);
  });

  it('detects cycles and inserts a cycle sentinel', () => {
    const entries = [res('A', 'B'), res('B', 'C'), res('C', 'A')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');

    expect(tree.entry.id).toBe('A');
    const b = tree.dependencies[0]!;
    expect(b.entry.id).toBe('B');
    const c = b.dependencies[0]!;
    expect(c.entry.id).toBe('C');
    expect(c.dependencies).toHaveLength(1);
    const cycleNode = c.dependencies[0]!;
    expect(cycleNode.cycle).toBeTruthy();
    expect(cycleNode.entry.id).toBe('A');
  });

  it('marks missing referenced entries with missing=true', () => {
    const entries = [res('A', 'X')];
    const tree = EntryGraph.fromEntries(entries).getDependencyTree('A');

    expect(tree.dependencies).toHaveLength(1);
    const missing = tree.dependencies[0]!;
    expect(missing.entry.id).toBe('X');
    expect(missing.missing).toBeTruthy();
    expect(missing.dependencies).toHaveLength(0);
  });
});
