import type { DependencyTree } from '../utilities/dependency-tree';
import { isComplete } from '../utilities/entry';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { Diagnostic } from './diagnostics';
import type { EntryGraph } from './entry-graph';
import { type IRBuildEnvelope, runIRBuildPipeline } from './pipeline';
import type { SirenEntry } from './types';

export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';

/**
 * Immutable IR context that exposes semantic snapshot data and query helpers.
 *
 * Instances are built internally from SirenBuilder and cannot be publicly
 * constructed.
 */
export class SirenProject {
  private readonly envelope: IRBuildEnvelope;

  private constructor(entries: readonly SirenEntry[]) {
    this.envelope = runIRBuildPipeline(entries);
    Object.freeze(this);
  }

  /**
   * Internal construction path used by SirenBuilder.
   */
  static [IR_CONTEXT_FACTORY](entries: readonly SirenEntry[]): SirenProject {
    return new SirenProject(entries);
  }

  /**
   * Get deduplicated entries with implicit milestone completeness resolved.
   * Milestones whose every dependency is complete are promoted to `status: 'complete'`.
   * First occurrence of each ID is kept, duplicates are dropped.
   */
  get entries(): readonly SirenEntry[] {
    return this.envelope.graph.entries;
  }

  /**
   * Cached dependency graph built once during pipeline construction. Exposed
   * so consumers (LSP, exporters, advanced queries) can reuse the same graph
   * instance instead of rebuilding it.
   */
  get graph(): EntryGraph {
    return this.envelope.graph;
  }

  findEntryById(id: string): SirenEntry {
    const entry = this.envelope.graph.getEntry(id);
    if (!entry) {
      throw new Error(`Entry with ID '${id}' not found`);
    }
    return entry;
  }

  getMilestoneIds(): string[] {
    return getMilestoneIds(this.entries);
  }

  getTasksByMilestone(): Map<string, SirenEntry[]> {
    return getTasksByMilestone(this.envelope.graph);
  }

  // TODO currently implemented with a sensible default traverse
  // but eventually needs to support a more expressive query interface
  getDependencyTree(rootId: string): DependencyTree {
    // By default, treat milestone nodes (except the root) as leaves when
    // expanding from a root entry. This mirrors CLI/listing behavior
    // where milestones act as grouping nodes and are not expanded further
    // in dependency trees unless explicitly requested. Also filter out
    // entries whose status is complete.
    const traversePredicate = (r: SirenEntry) => {
      if (isComplete(r)) return false;
      // Include non-root milestones as leaves (include but don't expand)
      if (r.type === 'milestone' && r.id !== rootId) {
        return { include: true, expand: false };
      }
      // Include and expand everything else
      return true;
    };
    return this.envelope.graph.getDependencyTree(rootId, traversePredicate);
  }

  /** Get semantic diagnostics computed from IR analysis */
  get diagnostics(): readonly Diagnostic[] {
    return this.envelope.diagnostics;
  }
}
