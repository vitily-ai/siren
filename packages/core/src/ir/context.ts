import { decodeDocument, type ParseDiagnostic } from '../decoder/index.js';
import type { DocumentNode } from '../parser/cst.js';
import { getIncompleteLeafDependencyChains } from '../utilities/dependency-chains.js';
import { findResourceById } from '../utilities/entry.js';
import { DirectedGraph } from '../utilities/graph.js';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone.js';
import type { Document, Resource, ResourceReference } from './types.js';

/**
 * Semantic diagnostic message produced from IR analysis
 */
export interface Diagnostic {
  /** Diagnostic code (e.g., 'W001' for warnings, 'E001' for errors) */
  readonly code: string;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Severity level */
  readonly severity: 'error' | 'warning' | 'info';
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

  getIncompleteLeafDependencyChains(
    rootId: string,
    comparator?: (a: string[], b: string[]) => number,
    options?: { onWarning?: (message: string) => void },
  ): string[][] {
    return getIncompleteLeafDependencyChains(rootId, [...this.resources], comparator, options);
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
    const { document, diagnostics } = decodeDocument(cst);
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
    const resourcesById = new Map(this.resources.map((resource) => [resource.id, resource]));

    // Add warnings for each cycle with file attribution
    for (const cycle of cycles) {
      let fileInfo = '';
      if (this.resourceSources) {
        // Find which files contain resources in this cycle
        const filesInCycle = new Set<string>();
        for (const nodeId of cycle.nodes) {
          const nodeSource = this.resourceSources.get(nodeId);
          if (nodeSource) {
            const relativePath = nodeSource.includes('/')
              ? nodeSource.substring(nodeSource.lastIndexOf('/') + 1)
              : nodeSource;
            filesInCycle.add(relativePath);
          }
        }
        if (filesInCycle.size > 0) {
          fileInfo = `${Array.from(filesInCycle).join(', ')}: `;
        }
      }

      diagnostics.push({
        code: 'W004',
        message: `${fileInfo}Circular dependency detected: ${cycle.nodes.join(' -> ')}`,
        severity: 'warning',
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
          diagnostics.push({
            code: 'W005',
            message: `Dangling dependency: ${resource.type} '${resource.id}' -> ${depId}?`,
            severity: 'warning',
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
