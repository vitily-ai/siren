/**
 * Directed graph utilities for dependency management
 *
 * Provides a simple, immutable directed graph for topological operations.
 * Used for dependency resolution, cycle detection, and traversal.
 */

export class DirectedGraph {
  private readonly adjacency: Map<string, Set<string>>;

  constructor() {
    this.adjacency = new Map();
  }

  /**
   * Add a node to the graph (idempotent)
   */
  addNode(id: string): void {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Set());
    }
  }

  /**
   * Add a directed edge from source to target (idempotent)
   */
  addEdge(source: string, target: string): void {
    this.addNode(source);
    this.addNode(target);
    this.adjacency.get(source)!.add(target);
  }

  /**
   * Get direct successors of a node
   */
  getSuccessors(id: string): string[] {
    return Array.from(this.adjacency.get(id) ?? []);
  }

  /**
   * Get all nodes in the graph
   */
  getNodes(): string[] {
    return Array.from(this.adjacency.keys());
  }

  /**
   * Check if the graph has cycles using DFS
   */
  hasCycle(): boolean {
    return this.getCycles().length > 0;
  }

  /**
   * Get all cycles in the graph as arrays of node IDs
   */
  getCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (recStack.has(node)) {
        // Cycle detected: from node back to node in path
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart).concat(node);
          cycles.push(cycle);
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const successor of this.getSuccessors(node)) {
        dfs(successor);
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of this.getNodes()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }
}
