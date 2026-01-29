import { getIncompleteLeafDependencyChains } from '../utilities/dependency-chains.js';

import { findResourceById } from '../utilities/entry.js';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone.js';
import type { Document, Resource } from './types.js';

/**
 * Immutable IR context that wraps a `Document` and exposes utility functions as methods.
 *
 * The class intentionally holds plain data (no hidden mutability) and delegates
 * to the pure utility functions in `packages/core/src/utilities`. This provides a
 * unified OO-style API surface while keeping the underlying representation
 * data-oriented and serializable.
 */
export class IRContext {
  public readonly resources: readonly Resource[];
  public readonly source?: string;
  public readonly cycles: readonly { nodes: readonly string[] }[];

  constructor(doc: Document) {
    // Shallow freeze top-level arrays to discourage accidental mutation.
    this.resources = Object.freeze(doc.resources.slice());
    this.source = doc.source;
    this.cycles = Object.freeze(
      (doc.cycles || []).map((c) => ({ nodes: Object.freeze(c.nodes.slice()) })),
    );
    Object.freeze(this);
  }

  findResourceById(id: string): Resource {
    return findResourceById([...this.resources], id);
  }

  getMilestoneIds(): string[] {
    return getMilestoneIds([...this.resources]);
  }

  getTasksByMilestone(): Map<string, Resource[]> {
    return getTasksByMilestone([...this.resources]);
  }

  getIncompleteLeafDependencyChains(
    rootId: string,
    comparator?: (a: string[], b: string[]) => number,
    options?: { onWarning?: (message: string) => void },
  ): string[][] {
    return getIncompleteLeafDependencyChains(rootId, [...this.resources], comparator, options);
  }

  // Convenience factory
  static fromResources(resources: readonly Resource[], source?: string) {
    return new IRContext({ resources: resources.slice(), source, cycles: [] });
  }
}
