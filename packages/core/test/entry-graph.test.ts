import { describe, expect, it } from 'vitest';
import { EntryGraph } from '../src/ir/entry-graph';
import type { SirenEntry } from '../src/ir/types';

function entry(id: string, dependsOn?: string): SirenEntry {
  return {
    type: 'task',
    id,
    attributes: dependsOn
      ? [
          {
            key: 'depends_on',
            value: [{ kind: 'reference', id: dependsOn }],
          },
        ]
      : [],
  };
}

describe('EntryGraph.dfs', () => {
  it('handles deep chains without overflowing the stack', () => {
    const chainLength = 25_000;
    const entries = Array.from({ length: chainLength + 1 }, (_, index) =>
      entry(`n${index}`, index < chainLength ? `n${index + 1}` : undefined),
    );

    const graph = EntryGraph.fromEntries(entries);
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
    } as unknown as EntryGraph;

    EntryGraph.prototype.dfs.call(fakeGraph, 'root', (node) => {
      visited.push(node);
      return true;
    });

    expect(visited).toEqual(['root', 'child']);
  });

  it('stops expanding once maxDepth is reached', () => {
    const entries = [entry('A', 'B'), entry('B', 'C'), entry('C')];
    const visited: Array<{ node: string; depth: number; path: string[] }> = [];

    EntryGraph.fromEntries(entries).dfs(
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
