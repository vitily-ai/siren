import { decodeDocument, type ParseDiagnostic } from '../decoder/index.js';
import type { DocumentNode } from '../parser/cst.js';
import {
  getDependencyTree as buildDependencyTree,
  type DependencyTree,
} from '../utilities/dependency-tree.js';
import { findResourceById } from '../utilities/entry.js';
import { DirectedGraph } from '../utilities/graph.js';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone.js';
import type { Document, Resource, ResourceReference } from './types.js';

/**
 * Semantic diagnostic message produced from IR analysis
 *
 * Structured as a discriminated union by code.
 * The `message` field is intentionally absent - frontends (CLI, web)
 * decide how to format diagnostics for display.
 */
export type Diagnostic = DanglingDependencyDiagnostic | CircularDependencyDiagnostic;

// TODO this looks like it should be an extension of a root interface instead of two separate interfaces
/**
 * W005: Dangling dependency (resource depends on non-existent resource)
 */
export interface DanglingDependencyDiagnostic {
  readonly code: 'W005';
  readonly severity: 'warning';
  /** ID of the resource that has the dangling dependency */
  readonly resourceId: string;
  /** Type of the resource (task or milestone) */
  readonly resourceType: 'task' | 'milestone';
  /** ID of the missing dependency */
  readonly dependencyId: string;
  /** Source file path (when resourceSources available) */
  readonly file?: string;
  /** 1-based line number (when origin available) */
  readonly line?: number;
  /** 0-based column number (when origin available) */
  readonly column?: number;
}

/**
 * W004: Circular dependency detected
 */
export interface CircularDependencyDiagnostic {
  readonly code: 'W004';
  readonly severity: 'warning';
  /** Nodes in the cycle, with the first node repeated at the end (e.g., ['a', 'b', 'c', 'a']) */
  readonly nodes: readonly string[];
  /** Source file path(s) (when resourceSources available) */
  readonly file?: string;
  /** 1-based line number of the first node in cycle (when origin available) */
  readonly line?: number;
  /** 0-based column number of the first node in cycle (when origin available) */
  readonly column?: number;
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
  public readonly resources: readonly Resource[];
  public readonly source?: string;
  public readonly parseDiagnostics: readonly ParseDiagnostic[];
  private readonly resourceSources?: ReadonlyMap<string, string>;
  private _diagnostics?: readonly Diagnostic[];
  private _cycles?: readonly { nodes: readonly string[] }[];
  private _danglingDiagnostics?: readonly Diagnostic[];

  constructor(
    doc: Document,
    parseDiagnostics: readonly ParseDiagnostic[] = [],
    resourceSources?: ReadonlyMap<string, string>,
  ) {
    // Shallow freeze top-level arrays to discourage accidental mutation.
    this.resources = Object.freeze(doc.resources.slice());
    this.source = doc.source;
    this.parseDiagnostics = Object.freeze(parseDiagnostics.slice());
    this.resourceSources = resourceSources;
    // Note: Don't freeze the object itself since we need lazy property assignment
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
    // complete tasks from the tree entirely.
    const traversePredicate = (r: Resource) => {
      // Exclude complete tasks entirely (don't include in tree)
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
   * Create an IRContext from a parsed CST, performing decoding and validation.
   * Diagnostics are collected and exposed via the context's `diagnostics` property.
   * @param cst - The parsed concrete syntax tree
   * @param source - Optional source file path or content
   * @returns IRContext with diagnostics
   */
  static fromCst(cst: DocumentNode, source?: string): IRContext {
    const { document, diagnostics } = decodeDocument(cst, source);
    if (!document) {
      // If decoding produced errors, create empty context with parse diagnostics
      return new IRContext({ resources: [], source }, diagnostics);
    }
    return new IRContext({ ...document, source }, diagnostics);
  }

  /**
   * Factory to create an IRContext from resources with optional file source mapping.
   */
  static fromResources(
    resources: readonly Resource[],
    source?: string,
    resourceSources?: ReadonlyMap<string, string>,
  ): IRContext {
    return new IRContext({ resources: resources.slice(), source }, [], resourceSources);
  }

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
        code: 'W004',
        severity: 'warning',
        nodes: cycle.nodes,
        ...fileInfo,
        ...positionInfo,
      });
    }

    diagnostics.push(...this.danglingDiagnostics);

    return Object.freeze(diagnostics);
  }

  /** Memoized getter for dangling dependency diagnostics */
  get danglingDiagnostics(): readonly Diagnostic[] {
    if (!this._danglingDiagnostics) {
      this._danglingDiagnostics = this.computeDanglingDiagnostics();
    }
    return this._danglingDiagnostics;
  }

  private computeDanglingDiagnostics(): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const resourcesById = new Map(this.resources.map((resource) => [resource.id, resource]));

    for (const resource of this.resources) {
      const dependsOn = IRContext.getDependsOn(resource);
      for (const depId of dependsOn) {
        if (!resourcesById.has(depId)) {
          const fileInfo = this.getFileInfoForResources([resource.id]);
          const positionInfo = resource.origin
            ? { line: resource.origin.startRow + 1, column: 0 }
            : {};

          diagnostics.push({
            code: 'W005',
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
   * Build file attribution object from resource IDs using resourceSources mapping.
   * Returns an object with a `file` property if sources are available, empty object otherwise.
   * For multiple files, joins them with ", ".
   */
  private getFileInfoForResources(nodeIds: readonly string[]): { file?: string } {
    if (!this.resourceSources || nodeIds.length === 0) return {};
    const files = new Set<string>();
    for (const nodeId of nodeIds) {
      const source = this.resourceSources.get(nodeId);
      if (source) {
        files.add(source);
      }
    }
    return files.size > 0 ? { file: Array.from(files).join(', ') } : {};
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
