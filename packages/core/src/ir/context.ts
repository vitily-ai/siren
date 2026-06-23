import type { DependencyTree } from '../utilities/dependency-tree';
import { isComplete } from '../utilities/entry';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { Diagnostic } from './diagnostics';
import { type IRBuildEnvelope, runIRBuildPipeline } from './pipeline';
import {
  type EntryStats,
  type EntryWithStats,
  isReference,
  type ProjectStatus,
  type SirenEntry,
} from './types';

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

  get entries(): readonly SirenEntry[] {
    return this.envelope.graph.entries;
  }

  findEntryById(id: string): SirenEntry {
    const entry = this.envelope.graph.getEntry(id);
    if (!entry) {
      throw new Error(`Entry with ID '${id}' not found`);
    }
    return entry;
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

  public getEntryStats(entry: string | SirenEntry): EntryStats {
    let it: SirenEntry;
    if (typeof entry === 'string') {
      it = this.findEntryById(entry);
    } else {
      it = entry;
    }

    const deps = it.attributes.find((a) => a.key === 'depends_on')?.value ?? [];

    const total = deps.length;
    const closed = deps.filter(
      (value) => isReference(value) && this.findEntryById(value.id).status === 'complete',
    ).length;

    return {
      deps: {
        total,
        closed,
      },
    };
  }

  public getStatus(): ProjectStatus {
    const milestones: EntryWithStats[] = this.entries
      .filter(({ type }) => type === 'milestone')
      // map to EntryWithStats
      .map((entry) => ({
        ...entry,
        stats: this.getEntryStats(entry),
      }));

    const open = [] as EntryWithStats[];
    const closed = [] as EntryWithStats[];
    const draft = [] as EntryWithStats[];

    milestones.forEach((m) => {
      switch (m.status) {
        case 'complete':
          closed.push(m);
          break;
        case 'draft':
          draft.push(m);
          break;
        default:
          open.push(m);
          break;
      }
    });

    return {
      open,
      closed,
      draft,
    };
  }
}
