import {
  getDependencyTree as buildDependencyTree,
  type DependencyTree,
} from '../utilities/dependency-tree';
import { findResourceById, getDependsOn, isComplete } from '../utilities/entry';
import { DirectedGraph } from '../utilities/graph';
import {
  buildDependencyGraph,
  getMilestoneIds,
  getTasksByMilestone,
  resolveStatus,
} from '../utilities/milestone';
import type { DiagnosticBase } from './diagnostics';
import type { Document, Resource } from './types';

/**
 * Semantic diagnostic message produced from IR analysis
 *
 * Structured as a discriminated union by code.
 * The `message` field is intentionally absent - frontends (CLI, web)
 * decide how to format diagnostics for display.
 */
export type Diagnostic =
  | DanglingDependencyDiagnostic
  | CircularDependencyDiagnostic
  | DuplicateIdDiagnostic;

/**
 * W002: Dangling dependency (resource depends on non-existent resource)
 */
export interface DanglingDependencyDiagnostic extends DiagnosticBase {
  readonly code: 'W002';
  readonly severity: 'warning';
  /** ID of the resource that has the dangling dependency */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** ID of the missing dependency */
  readonly dependencyId: string;
}

/**
 * W001: Circular dependency detected
 */
export interface CircularDependencyDiagnostic extends DiagnosticBase {
  readonly code: 'W001';
  readonly severity: 'warning';
  /** Nodes in the cycle, with the first node repeated at the end (e.g., ['a', 'b', 'c', 'a']) */
  readonly nodes: readonly string[];
}

/**
 * W003: Duplicate resource ID detected
 *
 * Emitted when multiple resources share the same ID. The first occurrence is kept,
 * and all subsequent occurrences are dropped with a warning. File attribution
 * is derived from each resource's origin.document field.
 */
export interface DuplicateIdDiagnostic extends DiagnosticBase {
  readonly code: 'W003';
  readonly severity: 'warning';
  /** ID of the duplicate resource */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** 1-based line number of the first (precedent) occurrence */
  readonly firstLine?: number;
  /** 0-based column number of the first (precedent) occurrence */
  readonly firstColumn?: number;
  /** Source file path of the first (precedent) occurrence (from origin.document) */
  readonly firstFile?: string;
  /** 1-based line number of the duplicate (second) occurrence - used for diagnostic position */
  readonly secondLine?: number;
  /** 0-based column number of the duplicate (second) occurrence */
  readonly secondColumn?: number;
}

/**
 * Immutable IR context that wraps a `Document` and exposes utility functions as methods.
 *
 * The class intentionally holds plain data (no hidden mutability) and delegates
 * to the pure utility functions in `packages/core/src/utilities`. This provides a
 * unified OO-style API surface while keeping the underlying representation
 * data-oriented and serializable.
 */
export class IRContext {
  /** All resources including duplicates - used for duplicate detection */
  private readonly _allResources: readonly Resource[];
  /** Deduplicated resources - computed lazily */
  private _uniqueResources?: readonly Resource[];
  public readonly source?: string;
  private _diagnostics?: readonly Diagnostic[];
  private _cycles?: readonly { nodes: readonly string[] }[];
  private _danglingDiagnostics?: readonly Diagnostic[];
  private _duplicateDiagnostics?: readonly DuplicateIdDiagnostic[];

  constructor(doc: Document) {
    // Store all resources including duplicates - deduplication happens lazily
    this._allResources = Object.freeze(doc.resources.slice());
    this.source = doc.source;
    // Note: Don't freeze the object itself since we need lazy property assignment
  }

  /**
   * Get deduplicated resources with milestone status resolved.
   * Milestones can be promoted to `draft` or `complete` based on dependencies.
   * First occurrence of each ID is kept, duplicates are dropped.
   * Use `duplicateDiagnostics` to get warnings about dropped duplicates.
   */
  get resources(): readonly Resource[] {
    if (!this._uniqueResources) {
      this._uniqueResources = this.resolveResources();
    }
    return this._uniqueResources;
  }

  /** Deduplicate then resolve milestone status */
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

    // 2. Resolve milestone status so .status is the single source of truth.
    const resourceMap = new Map(unique.map((r) => [r.id, r]));
    const graph = buildDependencyGraph(unique);
    const resolved = unique.map((r) => {
      const status = resolveStatus(r, resourceMap, graph);
      return status === r.status ? r : { ...r, status };
    });

    return Object.freeze(resolved);
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
      // since .status is resolved before resources are exposed)
      if (isComplete(r)) return false;
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

  /**
   * Factory to create an IRContext from resources.
   *
   * File attribution is read from each resource's origin.document field.
   * This replaces the previous resourceSources parameter pattern.
   */
  static fromResources(resources: readonly Resource[], source?: string): IRContext {
    return new IRContext({ resources: resources.slice(), source });
  }

  private computeCycles(): readonly { nodes: readonly string[] }[] {
    const graph = new DirectedGraph();
    for (const resource of this.resources) {
      graph.addNode(resource.id);
      const dependsOn = getDependsOn(resource);
      for (const depId of dependsOn) {
        graph.addEdge(resource.id, depId);
      }
    }
    const cycles = graph.getCycles();
    return Object.freeze(cycles.map((cycle) => ({ nodes: Object.freeze(cycle.slice()) })));
  }

  private computeDiagnostics(): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const cycles = this.cycles; // This will trigger cycle computation if needed

    // Add warnings for each cycle with file and position attribution
    for (const cycle of cycles) {
      const firstNodeId = cycle.nodes[0];
      const firstResource = this.resources.find((r) => r.id === firstNodeId);

      const fileInfo = this.getFileInfoForResources(cycle.nodes);
      const positionInfo = firstResource?.origin
        ? { line: firstResource.origin.startRow + 1, column: 0 }
        : {};

      diagnostics.push({
        code: 'W001',
        severity: 'warning',
        nodes: cycle.nodes,
        ...fileInfo,
        ...positionInfo,
      });
    }

    diagnostics.push(...this.danglingDiagnostics);
    diagnostics.push(...this.duplicateDiagnostics);

    return Object.freeze(diagnostics);
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

  /** Compute W003 diagnostics for duplicate resource IDs */
  private computeDuplicateDiagnostics(): readonly DuplicateIdDiagnostic[] {
    const diagnostics: DuplicateIdDiagnostic[] = [];
    const seen = new Map<string, Resource>();

    for (const resource of this._allResources) {
      const first = seen.get(resource.id);
      if (first) {
        // Duplicate detected - emit W003 diagnostic
        const firstPos = first.origin
          ? { firstLine: first.origin.startRow + 1, firstColumn: 0 }
          : {};
        // Determine precedent file using resource lookup to ensure attribution
        // works even when origin.document may be absent on the stored `first` object.
        const firstFile = this.getFileInfoForResources([resource.id]).file;
        const secondPos = resource.origin
          ? { secondLine: resource.origin.startRow + 1, secondColumn: 0 }
          : {};

        // File attribution: use duplicate's origin.document if available
        const file = resource.origin?.document;

        diagnostics.push({
          code: 'W003',
          severity: 'warning',
          resourceId: resource.id,
          resourceType: resource.type,
          file,
          firstFile,
          ...firstPos,
          ...secondPos,
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
      const dependsOn = getDependsOn(resource);
      for (const depId of dependsOn) {
        if (!resourcesById.has(depId)) {
          const fileInfo = this.getFileInfoForResources([resource.id]);
          const positionInfo = resource.origin
            ? { line: resource.origin.startRow + 1, column: 0 }
            : {};

          diagnostics.push({
            code: 'W002',
            severity: 'warning',
            resourceId: resource.id,
            resourceType: resource.type,
            dependencyId: depId,
            ...fileInfo,
            ...positionInfo,
          });
        }
      }
    }

    return Object.freeze(diagnostics);
  }

  /**
   * Build file attribution object from resource IDs using origin.document.
   * Returns an object with a `file` property if sources are available, empty object otherwise.
   * For multiple files, joins them with ", ".
   */
  private getFileInfoForResources(nodeIds: readonly string[]): { file?: string } {
    if (nodeIds.length === 0) return {};
    const files = new Set<string>();
    for (const nodeId of nodeIds) {
      const resource = this.resources.find((r) => r.id === nodeId);
      if (resource?.origin?.document) {
        files.add(resource.origin.document);
      }
    }
    return files.size > 0 ? { file: Array.from(files).join(', ') } : {};
  }
}
