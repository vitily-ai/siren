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
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      for (const successor of this.getSuccessors(node)) {
        if (dfs(successor)) return true;
      }

      recStack.delete(node);
      return false;
    };

    for (const node of this.getNodes()) {
      if (dfs(node)) return true;
    }

    return false;
  }
}
