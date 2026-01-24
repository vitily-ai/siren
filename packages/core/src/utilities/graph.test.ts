import { describe, expect, it } from 'vitest';
import { DirectedGraph } from './graph.js';

describe('DirectedGraph', () => {
  describe('basic operations', () => {
    it('starts empty', () => {
      const graph = new DirectedGraph();
      expect(graph.getNodes()).toEqual([]);
    });

    it('adds nodes', () => {
      const graph = new DirectedGraph();
      graph.addNode('a');
      graph.addNode('b');
      expect(graph.getNodes()).toEqual(['a', 'b']);
    });

    it('addNode is idempotent', () => {
      const graph = new DirectedGraph();
      graph.addNode('a');
      graph.addNode('a');
      expect(graph.getNodes()).toEqual(['a']);
    });

    it('adds edges', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      expect(graph.getNodes()).toEqual(['a', 'b']);
      expect(graph.getSuccessors('a')).toEqual(['b']);
      expect(graph.getSuccessors('b')).toEqual([]);
    });

    it('addEdge is idempotent', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('a', 'b');
      expect(graph.getSuccessors('a')).toEqual(['b']);
    });

    it('handles multiple edges from one node', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('a', 'c');
      expect(graph.getSuccessors('a')).toEqual(['b', 'c']);
    });

    it('handles incoming edges', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'c');
      graph.addEdge('b', 'c');
      expect(graph.getSuccessors('c')).toEqual([]);
      expect(graph.getSuccessors('a')).toEqual(['c']);
      expect(graph.getSuccessors('b')).toEqual(['c']);
    });
  });

  describe('cycle detection', () => {
    it('detects no cycle in empty graph', () => {
      const graph = new DirectedGraph();
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in single node', () => {
      const graph = new DirectedGraph();
      graph.addNode('a');
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects no cycle in DAG', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'c');
      graph.addEdge('a', 'c');
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects self-loop cycle', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'a');
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'a']]);
    });

    it('detects simple cycle', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'a');
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'a']]);
    });

    it('detects cycle in larger graph', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'c');
      graph.addEdge('c', 'a');
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['a', 'b', 'c', 'a']]);
    });

    it('handles disconnected components with cycles', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('c', 'd');
      graph.addEdge('d', 'c'); // cycle in second component
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([['c', 'd', 'c']]);
    });

    it('no cycle in disconnected DAGs', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('c', 'd');
      expect(graph.hasCycle()).toBe(false);
      expect(graph.getCycles()).toEqual([]);
    });

    it('detects multiple cycles', () => {
      const graph = new DirectedGraph();
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'a');
      graph.addEdge('c', 'd');
      graph.addEdge('d', 'c');
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getCycles()).toEqual([
        ['a', 'b', 'a'],
        ['c', 'd', 'c'],
      ]);
    });
  });
});
