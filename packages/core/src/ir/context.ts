import { CoreDiagnosticCode } from '../diagnostics/codes.js';
import type { Diagnostic, DuplicateIdDiagnostic } from '../diagnostics/types.js';
import {
  getDependencyTree as buildDependencyTree,
  type DependencyTree,
} from '../utilities/dependency-tree.js';
import { findResourceById } from '../utilities/entry.js';
import { DirectedGraph } from '../utilities/graph.js';
import {
  buildDependencyGraph,
  getMilestoneIds,
  getTasksByMilestone,
  isImplicitlyComplete,
} from '../utilities/milestone.js';
import type { Resource, ResourceReference } from './types.js';

/**
 * Immutable IR context that wraps a list of resources and exposes
 * semantic analysis as lazy, memoized getters.
 *
 * Construction is via static factories (`empty`, `fromResources`) and
 * immutable accumulators (`withResource`, `withResources`). Each accumulator
 * returns a new instance; caches are never shared between instances.
 *
 * The class delegates to pure utility functions in `src/utilities/`.
 */
export class IRContext {
  /** All resources including duplicates - used for duplicate detection */
  private readonly _allResources: readonly Resource[];
  /** Deduplicated resources - computed lazily */
  private _uniqueResources?: readonly Resource[];
  private _diagnostics?: readonly Diagnostic[];
  private _cycles?: readonly { nodes: readonly string[] }[];
  private _danglingDiagnostics?: readonly Diagnostic[];
  private _duplicateDiagnostics?: readonly DuplicateIdDiagnostic[];

  private constructor(resources: readonly Resource[]) {
    this._allResources = Object.freeze(resources.slice());
  }

  // ---------------------------------------------------------------------------
  // Factories
  // ---------------------------------------------------------------------------

  /** Create an empty IRContext with no resources. */
  static empty(): IRContext {
    return new IRContext([]);
  }

  /**
   * Create an IRContext from a flat list of resources.
   * This is the primary factory for constructing an IR from decoded output.
   */
  static fromResources(resources: readonly Resource[]): IRContext {
    return new IRContext(resources);
  }

  // ---------------------------------------------------------------------------
  // Immutable accumulators
  // ---------------------------------------------------------------------------

  /** Return a new IRContext with the given resource appended. */
  withResource(resource: Resource): IRContext {
    return new IRContext([...this._allResources, resource]);
  }

  /** Return a new IRContext with the given resources appended. */
  withResources(resources: readonly Resource[]): IRContext {
    return new IRContext([...this._allResources, ...resources]);
  }

  // ---------------------------------------------------------------------------
  // Resources (lazy, deduplicated, milestone-resolved)
  // ---------------------------------------------------------------------------

  /**
   * Get deduplicated resources with implicit milestone completeness resolved.
   * Milestones whose every dependency is complete are promoted to `complete: true`.
   * First occurrence of each ID is kept, duplicates are dropped.
   * Use `duplicateDiagnostics` to get warnings about dropped duplicates.
   */
  get resources(): readonly Resource[] {
    if (!this._uniqueResources) {
      this._uniqueResources = this.resolveResources();
    }
    return this._uniqueResources;
  }

  /** Deduplicate then resolve implicit milestone completeness */
  private resolveResources(): readonly Resource[] {
    // 1. Deduplicate — first occurrence wins
    const seen = new Set<string>();
    const unique: Resource[] = [];
    for (const resource of this._allResources) {
      if (!seen.has(resource.id)) {
        seen.add(resource.id);
        unique.push(resource);
      }
    }

    // 2. Promote implicitly-complete milestones so .complete is the single
    //    source of truth for completeness (explicit and implicit).
    const resourceMap = new Map(unique.map((r) => [r.id, r]));
    const graph = buildDependencyGraph(unique);
    const resolved = unique.map((r) =>
      !r.complete && isImplicitlyComplete(r, resourceMap, graph) ? { ...r, complete: true } : r,
    );

    return Object.freeze(resolved);
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  findResourceById(id: string): Resource {
    return findResourceById([...this.resources], id);
  }

  getMilestoneIds(): string[] {
    return getMilestoneIds([...this.resources]);
  }

  getTasksByMilestone(): Map<string, Resource[]> {
    return getTasksByMilestone([...this.resources]);
  }

  getDependencyTree(rootId: string): DependencyTree {
    const traversePredicate = (r: Resource) => {
      if (r.complete) return false;
      if (r.type === 'milestone' && r.id !== rootId) {
        return { include: true, expand: false };
      }
      return true;
    };
    return buildDependencyTree(rootId, [...this.resources], traversePredicate);
  }

  // ---------------------------------------------------------------------------
  // Diagnostics (lazy, memoized)
  // ---------------------------------------------------------------------------

  /** Get semantic diagnostics computed from IR analysis */
  get diagnostics(): readonly Diagnostic[] {
    if (!this._diagnostics) {
      this._diagnostics = this.computeDiagnostics();
    }
    return this._diagnostics;
  }

  /** Get dependency cycles detected in the IR */
  get cycles(): readonly { nodes: readonly string[] }[] {
    if (!this._cycles) {
      this._cycles = this.computeCycles();
    }
    return this._cycles;
  }

  /** Memoized getter for dangling dependency diagnostics */
  get danglingDiagnostics(): readonly Diagnostic[] {
    if (!this._danglingDiagnostics) {
      this._danglingDiagnostics = this.computeDanglingDiagnostics();
    }
    return this._danglingDiagnostics;
  }

  /** Memoized getter for duplicate ID diagnostics */
  get duplicateDiagnostics(): readonly DuplicateIdDiagnostic[] {
    if (!this._duplicateDiagnostics) {
      this._duplicateDiagnostics = this.computeDuplicateDiagnostics();
    }
    return this._duplicateDiagnostics;
  }

  // ---------------------------------------------------------------------------
  // Private diagnostic computation
  // ---------------------------------------------------------------------------

  private computeCycles(): readonly { nodes: readonly string[] }[] {
    const graph = new DirectedGraph();
    for (const resource of this.resources) {
      graph.addNode(resource.id);
      const dependsOn = IRContext.getDependsOn(resource);
      for (const depId of dependsOn) {
        graph.addEdge(resource.id, depId);
      }
    }
    const cycles = graph.getCycles();
    return Object.freeze(cycles.map((cycle) => ({ nodes: Object.freeze(cycle.slice()) })));
  }

  private computeDiagnostics(): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const cycle of this.cycles) {
      const firstNodeId = cycle.nodes[0];
      const firstResource = this.resources.find((r) => r.id === firstNodeId);

      diagnostics.push({
        code: CoreDiagnosticCode.CIRCULAR_DEPENDENCY,
        severity: 'warning',
        nodes: cycle.nodes,
        source: firstResource?.source,
      });
    }

    diagnostics.push(...this.danglingDiagnostics);
    diagnostics.push(...this.duplicateDiagnostics);

    return Object.freeze(diagnostics);
  }

  private computeDuplicateDiagnostics(): readonly DuplicateIdDiagnostic[] {
    const diagnostics: DuplicateIdDiagnostic[] = [];
    const seen = new Map<string, Resource>();

    for (const resource of this._allResources) {
      const first = seen.get(resource.id);
      if (first) {
        diagnostics.push({
          code: CoreDiagnosticCode.DUPLICATE_ID,
          severity: 'warning',
          resourceId: resource.id,
          resourceType: resource.type,
          source: resource.source,
          firstSource: first.source,
        });
      } else {
        seen.set(resource.id, resource);
      }
    }

    return Object.freeze(diagnostics);
  }

  private computeDanglingDiagnostics(): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const resourcesById = new Map(this.resources.map((resource) => [resource.id, resource]));

    for (const resource of this.resources) {
      const dependsOn = IRContext.getDependsOn(resource);
      for (const depId of dependsOn) {
        if (!resourcesById.has(depId)) {
          diagnostics.push({
            code: CoreDiagnosticCode.DANGLING_DEPENDENCY,
            severity: 'warning',
            resourceId: resource.id,
            resourceType: resource.type,
            dependencyId: depId,
            source: resource.source,
          });
        }
      }
    }

    return Object.freeze(diagnostics);
  }

  /**
   * Helper to extract dependency IDs from a resource's depends_on attribute.
   */
  private static getDependsOn(resource: Resource): string[] {
    const attr = resource.attributes.find((a) => a.key === 'depends_on');
    if (!attr) return [];

    const value = attr.value;
    if (value === null) return [];
    if (typeof value === 'object' && 'kind' in value) {
      if (value.kind === 'reference') {
        return [value.id];
      }
      if (value.kind === 'array') {
        return value.elements
          .filter(
            (el): el is ResourceReference =>
              typeof el === 'object' && el !== null && 'kind' in el && el.kind === 'reference',
          )
          .map((ref) => ref.id);
      }
    }
    return [];
  }
}
