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
   * Get all elementary cycles in the graph as arrays of node IDs
   */
  getCycles(): string[][] {
    const cycles: string[][] = [];

    for (const start of this.getNodes()) {
      const path: string[] = [];
      const pathSet = new Set<string>();

      const dfs = (node: string): void => {
        path.push(node);
        pathSet.add(node);

        for (const successor of this.getSuccessors(node)) {
          if (pathSet.has(successor)) {
            // Cycle found: successor is in current path
            const cycleStart = path.indexOf(successor);
            // `cycle` temporarily includes the closing duplicate (successor)
            // e.g. path slice -> ['a','b','c'] + successor -> ['a','b','c','a']
            const cycle = path.slice(cycleStart).concat(successor);
            // Normalize cycle: rotate to start with the lexicographically smallest node
            // Exclude the temporary closing duplicate for rotation calculations
            const cycleNodes = cycle.slice(0, -1);
            const minNode = cycleNodes.reduce((min, curr) => (curr < min ? curr : min));
            const minIndex = cycleNodes.indexOf(minNode);
            // Re-add the starting node at the end to produce the canonical
            // representation that explicitly closes the cycle, e.g. ['a','b','c','a']
            const normalized = cycleNodes
              .slice(minIndex)
              .concat(cycleNodes.slice(0, minIndex), minNode);
            cycles.push(normalized);
          } else {
            dfs(successor);
          }
        }

        path.pop();
        pathSet.delete(node);
      };

      dfs(start);
    }

    // Deduplicate cycles
    const uniqueCycles = Array.from(new Set(cycles.map((c) => c.join(',')))).map((s) =>
      s.split(','),
    );

    return uniqueCycles;
  }
}
