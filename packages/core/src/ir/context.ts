import { decodeDocument } from '../decoder/index.js';
import type { DocumentNode } from '../parser/cst.js';
import { getIncompleteLeafDependencyChains } from '../utilities/dependency-chains.js';
import { findResourceById } from '../utilities/entry.js';
import { DirectedGraph } from '../utilities/graph.js';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone.js';
import type { Document, Resource, ResourceReference } from './types.js';

/**
 * Diagnostic message produced during IR construction
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
  public readonly cycles: readonly { nodes: readonly string[] }[];
  public readonly diagnostics: readonly Diagnostic[];

  constructor(doc: Document, diagnostics: readonly Diagnostic[] = []) {
    // Shallow freeze top-level arrays to discourage accidental mutation.
    this.resources = Object.freeze(doc.resources.slice());
    this.source = doc.source;
    this.cycles = Object.freeze(
      (doc.cycles || []).map((c) => ({ nodes: Object.freeze(c.nodes.slice()) })),
    );
    this.diagnostics = Object.freeze(diagnostics.slice());
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
      // If decoding produced errors, create empty context with diagnostics
      return new IRContext({ resources: [], cycles: [], source }, diagnostics);
    }
    return new IRContext(document, diagnostics);
  }

  /**
   * Factory to create an IRContext from resources, detecting cycles and generating diagnostics.
   * Performs the same cycle detection as fromCst() but starts from already-decoded resources.
   */
  static fromResources(resources: readonly Resource[], source?: string): IRContext {
    const diagnostics: Diagnostic[] = [];

    // Build dependency graph and check for cycles
    const graph = new DirectedGraph();
    for (const resource of resources) {
      graph.addNode(resource.id);
      const dependsOn = IRContext.getDependsOn(resource);
      for (const depId of dependsOn) {
        graph.addEdge(resource.id, depId);
      }
    }
    const cycles = graph.getCycles();
    const cyclesIr: { nodes: readonly string[] }[] = cycles.map((cycle) => ({ nodes: cycle }));

    // Add warnings for each cycle
    for (const cycle of cycles) {
      diagnostics.push({
        code: 'W004',
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        severity: 'warning',
      });
    }

    return new IRContext({ resources: resources.slice(), source, cycles: cyclesIr }, diagnostics);
  }

  /**
   * Helper to extract dependency IDs from a resource's depends_on attribute.
   * Duplicated from decoder/index.ts to avoid circular dependencies.
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
