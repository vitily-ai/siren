import { describe, expect, it } from 'vitest';
import { EntryGraph } from './entry-graph';
import type { SirenEntry } from './types';

function entry(id: string, dependsOn?: readonly string[]): SirenEntry {
  return {
    type: 'task',
    id,
    attributes:
      dependsOn && dependsOn.length > 0
        ? [
            {
              key: 'depends_on',
              value: dependsOn.map((depId) => ({ kind: 'reference' as const, id: depId })),
            },
          ]
        : [],
  };
}

describe('EntryGraph', () => {
  describe('basic operations', () => {
    it('starts empty', () => {
      const graph = EntryGraph.fromEntries([]);
      expect(graph.getNodes()).toEqual([]);
    });

    it('exposes a consistent entry index', () => {
      const graph = EntryGraph.fromEntries([entry('a'), entry('b')]);

      expect(graph.getNodes()).toEqual(['a', 'b']);
      expect(graph.getEntry('a')).toBe(graph.entries[0]);
      expect(graph.getEntry('b')).toBe(graph.entries[1]);
      expect(graph.entries.map((current) => current.id)).toEqual(['a', 'b']);
    });

    it('adds entry ids as nodes', () => {
      const graph = EntryGraph.fromEntries([entry('a'), entry('b')]);
      expect(graph.getNodes()).toEqual(['a', 'b']);
    });

    it('adds edges from depends_on relationships', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['b'])]);
      expect(graph.getNodes()).toEqual(['a', 'b']);
      expect(graph.getSuccessors('a')).toEqual(['b']);
      expect(graph.getSuccessors('b')).toEqual([]);
    });

    it('deduplicates duplicate dependency edges', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['b', 'b'])]);
      expect(graph.getSuccessors('a')).toEqual(['b']);
    });

    it('handles multiple edges from one node', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['b', 'c'])]);
      expect(graph.getSuccessors('a')).toEqual(['b', 'c']);
    });

    it('handles incoming edges', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['c']), entry('b', ['c'])]);
      expect(graph.getSuccessors('c')).toEqual([]);
      expect(graph.getSuccessors('a')).toEqual(['c']);
      expect(graph.getSuccessors('b')).toEqual(['c']);
    });
  });

  describe('cycle detection', () => {
    it('detects no cycle in empty graph', () => {
      const graph = EntryGraph.fromEntries([]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in single node graph', () => {
      const graph = EntryGraph.fromEntries([entry('a')]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in a DAG', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['b', 'c']), entry('b', ['c']), entry('c')]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects self-loop cycle', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['a'])]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'a']]);
    });

    it('detects simple cycle', () => {
      const graph = EntryGraph.fromEntries([entry('a', ['b']), entry('b', ['a'])]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'a']]);
    });

    it('detects cycle in larger graph', () => {
      const graph = EntryGraph.fromEntries([
        entry('a', ['b']),
        entry('b', ['c']),
        entry('c', ['a']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'c', 'a']]);
    });

    it('handles disconnected components with cycles', () => {
      const graph = EntryGraph.fromEntries([
        entry('a', ['b']),
        entry('b'),
        entry('c', ['d']),
        entry('d', ['c']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['c', 'd', 'c']]);
    });

    it('detects multiple cycles', () => {
      const graph = EntryGraph.fromEntries([
        entry('a', ['b']),
        entry('b', ['a']),
        entry('c', ['d']),
        entry('d', ['c']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([
        ['a', 'b', 'a'],
        ['c', 'd', 'c'],
      ]);
    });
  });
});
