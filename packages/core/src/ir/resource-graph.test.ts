import { describe, expect, it } from 'vitest';
import { ResourceGraph } from './resource-graph';
import type { Resource } from './types';

function resource(id: string, dependsOn?: readonly string[]): Resource {
  return {
    type: 'task',
    id,
    attributes:
      dependsOn && dependsOn.length > 0
        ? [
            {
              key: 'depends_on',
              value:
                dependsOn.length === 1
                  ? { kind: 'reference', id: dependsOn[0] }
                  : {
                      kind: 'array',
                      elements: dependsOn.map((depId) => ({ kind: 'reference', id: depId })),
                    },
            },
          ]
        : [],
  };
}

describe('ResourceGraph', () => {
  describe('basic operations', () => {
    it('starts empty', () => {
      const graph = ResourceGraph.fromResources([]);
      expect(graph.getNodes()).toEqual([]);
    });

    it('exposes a consistent resource index', () => {
      const graph = ResourceGraph.fromResources([resource('a'), resource('b')]);

      expect(graph.getNodes()).toEqual(['a', 'b']);
      expect(graph.getResource('a')).toBe(graph.resources[0]);
      expect(graph.getResource('b')).toBe(graph.resources[1]);
      expect(graph.resources.map((current) => current.id)).toEqual(['a', 'b']);
    });

    it('adds resource ids as nodes', () => {
      const graph = ResourceGraph.fromResources([resource('a'), resource('b')]);
      expect(graph.getNodes()).toEqual(['a', 'b']);
    });

    it('adds edges from depends_on relationships', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['b'])]);
      expect(graph.getNodes()).toEqual(['a', 'b']);
      expect(graph.getSuccessors('a')).toEqual(['b']);
      expect(graph.getSuccessors('b')).toEqual([]);
    });

    it('deduplicates duplicate dependency edges', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['b', 'b'])]);
      expect(graph.getSuccessors('a')).toEqual(['b']);
    });

    it('handles multiple edges from one node', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['b', 'c'])]);
      expect(graph.getSuccessors('a')).toEqual(['b', 'c']);
    });

    it('handles incoming edges', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['c']), resource('b', ['c'])]);
      expect(graph.getSuccessors('c')).toEqual([]);
      expect(graph.getSuccessors('a')).toEqual(['c']);
      expect(graph.getSuccessors('b')).toEqual(['c']);
    });
  });

  describe('cycle detection', () => {
    it('detects no cycle in empty graph', () => {
      const graph = ResourceGraph.fromResources([]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in single node graph', () => {
      const graph = ResourceGraph.fromResources([resource('a')]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in a DAG', () => {
      const graph = ResourceGraph.fromResources([
        resource('a', ['b', 'c']),
        resource('b', ['c']),
        resource('c'),
      ]);
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects self-loop cycle', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['a'])]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'a']]);
    });

    it('detects simple cycle', () => {
      const graph = ResourceGraph.fromResources([resource('a', ['b']), resource('b', ['a'])]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'a']]);
    });

    it('detects cycle in larger graph', () => {
      const graph = ResourceGraph.fromResources([
        resource('a', ['b']),
        resource('b', ['c']),
        resource('c', ['a']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'c', 'a']]);
    });

    it('handles disconnected components with cycles', () => {
      const graph = ResourceGraph.fromResources([
        resource('a', ['b']),
        resource('b'),
        resource('c', ['d']),
        resource('d', ['c']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['c', 'd', 'c']]);
    });

    it('detects multiple cycles', () => {
      const graph = ResourceGraph.fromResources([
        resource('a', ['b']),
        resource('b', ['a']),
        resource('c', ['d']),
        resource('d', ['c']),
      ]);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([
        ['a', 'b', 'a'],
        ['c', 'd', 'c'],
      ]);
    });
  });
});
