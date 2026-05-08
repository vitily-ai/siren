import { describe, expect, it } from 'vitest';
import { ResourceGraph } from '../src/ir/resource-graph';
import type { Resource } from '../src/ir/types';

function resource(id: string, dependsOn?: string): Resource {
  return {
    type: 'task',
    id,
    attributes: dependsOn
      ? [
          {
            key: 'depends_on',
            value: { kind: 'reference', id: dependsOn },
          },
        ]
      : [],
  };
}

describe('ResourceGraph.dfs', () => {
  it('handles deep chains without overflowing the stack', () => {
    const chainLength = 25_000;
    const resources = Array.from({ length: chainLength + 1 }, (_, index) =>
      resource(`n${index}`, index < chainLength ? `n${index + 1}` : undefined),
    );

    const graph = ResourceGraph.fromResources(resources);
    let visitedCount = 0;
    let lastNode = '';

    graph.dfs('n0', (node) => {
      visitedCount += 1;
      lastNode = node;
      return true;
    });

    expect(visitedCount).toBe(chainLength + 1);
    expect(lastNode).toBe(`n${chainLength}`);
  });

  it('skips undefined successors from malformed successor arrays', () => {
    const visited: Array<string | undefined> = [];
    const fakeGraph = {
      getSuccessors(id: string): string[] {
        return id === 'root' ? ['child', undefined as unknown as string] : [];
      },
    } as unknown as ResourceGraph;

    ResourceGraph.prototype.dfs.call(fakeGraph, 'root', (node) => {
      visited.push(node);
      return true;
    });

    expect(visited).toEqual(['root', 'child']);
  });

  it('stops expanding once maxDepth is reached', () => {
    const resources = [resource('A', 'B'), resource('B', 'C'), resource('C')];
    const visited: Array<{ node: string; depth: number; path: string[] }> = [];

    ResourceGraph.fromResources(resources).dfs(
      'A',
      (node, path, depth) => {
        visited.push({ node, depth, path });
        return true;
      },
      { maxDepth: 1 },
    );

    expect(visited).toEqual([
      { node: 'A', depth: 0, path: ['A'] },
      { node: 'B', depth: 1, path: ['A', 'B'] },
    ]);
  });
});
