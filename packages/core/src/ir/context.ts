import { decodeDocument } from '../decoder/index.js';
import type { DocumentNode } from '../parser/cst.js';
import { getIncompleteLeafDependencyChains } from '../utilities/dependency-chains.js';
import { findResourceById } from '../utilities/entry.js';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone.js';
import type { Document, Resource } from './types.js';

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
   * Convenience factory to create an IRContext from resources without decoding.
   * Useful for constructing IR from already-decoded resources (e.g., in tests).
   */
  static fromResources(resources: readonly Resource[], source?: string): IRContext {
    return new IRContext({ resources: resources.slice(), source, cycles: [] });
  }
}
