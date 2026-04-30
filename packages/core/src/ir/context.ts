import {
  getDependencyTree as buildDependencyTree,
  type DependencyTree,
} from '../utilities/dependency-tree';
import { findResourceById } from '../utilities/entry';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone';
import { buildIRContextSnapshot, type IRContextSnapshot } from './builder';
import type { DependencyCycle, Diagnostic, DuplicateIdDiagnostic } from './diagnostics';
import type { Document, Resource } from './types';

export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';

/**
 * Immutable IR context that wraps a `Document` and exposes utility functions as methods.
 *
 * The class intentionally holds plain data (no hidden mutability) and delegates
 * to the pure utility functions in `packages/core/src/utilities`. This provides a
 * unified OO-style API surface while keeping the underlying representation
 * data-oriented and serializable.
 */
export class IRContext {
  private readonly snapshot: IRContextSnapshot;
  /** Legacy readable source metadata. Semantic attribution comes from resource origins. */
  public readonly source?: string;

  /**
   * @deprecated Prefer `IRAssembly.fromResources(resources).build()` for new construction paths.
   */
  constructor(doc: Document) {
    this.snapshot = buildIRContextSnapshot(doc.resources);
    this.source = doc.source;
    Object.freeze(this);
  }

  /**
   * Get deduplicated resources with implicit milestone completeness resolved.
   * Milestones whose every dependency is complete are promoted to `complete: true`.
   * First occurrence of each ID is kept, duplicates are dropped.
   * Use `duplicateDiagnostics` to get warnings about dropped duplicates.
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

  /** Get dependency cycles detected in the IR */
  get cycles(): readonly DependencyCycle[] {
    return this.snapshot.cycles;
  }

  /**
   * Factory to create an IRContext from resources.
   *
   * File attribution is read from each resource's origin.document field.
   * This replaces the previous resourceSources parameter pattern.
   *
   * @deprecated Prefer `IRAssembly.fromResources(resources).build()` for new construction paths.
   */
  static fromResources(resources: readonly Resource[], source?: string): IRContext {
    return new IRContext({ resources: resources.slice(), source });
  }

  /** Get dangling dependency diagnostics from the built semantic snapshot */
  get danglingDiagnostics(): readonly Diagnostic[] {
    return this.snapshot.danglingDiagnostics;
  }

  /** Get duplicate ID diagnostics from the built semantic snapshot */
  get duplicateDiagnostics(): readonly DuplicateIdDiagnostic[] {
    return this.snapshot.duplicateDiagnostics;
  }
}
