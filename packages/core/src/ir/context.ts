import {
  getDependencyTree as buildDependencyTree,
  type DependencyTree,
} from '../utilities/dependency-tree';
import { findResourceById } from '../utilities/entry';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone';
import { buildIRContextSnapshot, type IRContextSnapshot } from './builder';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { Diagnostic } from './diagnostics';
import type { Resource } from './types';

export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';

/**
 * Immutable IR context that exposes semantic snapshot data and query helpers.
 *
 * Instances are built internally from IRAssembly and cannot be publicly
 * constructed.
 */
export class IRContext {
  private readonly snapshot: IRContextSnapshot;

  private constructor(resources: readonly Resource[]) {
    this.snapshot = buildIRContextSnapshot(resources);
    Object.freeze(this);
  }

  /**
   * Internal construction path used by IRAssembly.
   */
  static [IR_CONTEXT_FACTORY](resources: readonly Resource[]): IRContext {
    return new IRContext(resources);
  }

  /**
   * Get deduplicated resources with implicit milestone completeness resolved.
   * Milestones whose every dependency is complete are promoted to `complete: true`.
   * First occurrence of each ID is kept, duplicates are dropped.
   */
  get resources(): readonly Resource[] {
    return this.snapshot.resources;
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

  // TODO currently implemented with a sensible default traverse
  // but eventually needs to support a more expressive query interface
  getDependencyTree(rootId: string): DependencyTree {
    // By default, treat milestone nodes (except the root) as leaves when
    // expanding from a root resource. This mirrors CLI/listing behavior
    // where milestones act as grouping nodes and are not expanded further
    // in dependency trees unless explicitly requested. Also filter out
    // complete resources (explicit or implicitly-resolved) from the tree.
    const traversePredicate = (r: Resource) => {
      // Exclude complete resources (includes implicitly-complete milestones
      // since .complete is resolved before resources are exposed)
      if (r.complete) return false;
      // Include non-root milestones as leaves (include but don't expand)
      if (r.type === 'milestone' && r.id !== rootId) {
        return { include: true, expand: false };
      }
      // Include and expand everything else
      return true;
    };
    return buildDependencyTree(rootId, [...this.resources], traversePredicate);
  }

  /** Get semantic diagnostics computed from IR analysis */
  get diagnostics(): readonly Diagnostic[] {
    return this.snapshot.diagnostics;
  }
}
