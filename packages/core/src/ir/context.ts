import type { DependencyTree } from '../utilities/dependency-tree';
import { isComplete } from '../utilities/entry';
import { getMilestoneIds, getTasksByMilestone } from '../utilities/milestone';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { Diagnostic } from './diagnostics';
import { type IRBuildEnvelope, runIRBuildPipeline } from './pipeline';
import type { ResourceGraph } from './resource-graph';
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
 * Instances are built internally from SirenBuilder and cannot be publicly
 * constructed.
 */
export class SirenProject {
  private readonly envelope: IRBuildEnvelope;

  private constructor(resources: readonly Resource[]) {
    this.envelope = runIRBuildPipeline(resources);
    Object.freeze(this);
  }

  /**
   * Internal construction path used by SirenBuilder.
   */
  static [IR_CONTEXT_FACTORY](resources: readonly Resource[]): SirenProject {
    return new SirenProject(resources);
  }

  /**
   * Get deduplicated resources with implicit milestone completeness resolved.
   * Milestones whose every dependency is complete are promoted to `status: 'complete'`.
   * First occurrence of each ID is kept, duplicates are dropped.
   */
  get resources(): readonly Resource[] {
    return this.envelope.graph.resources;
  }

  /**
   * Cached dependency graph built once during pipeline construction. Exposed
   * so consumers (LSP, exporters, advanced queries) can reuse the same graph
   * instance instead of rebuilding it.
   */
  get graph(): ResourceGraph {
    return this.envelope.graph;
  }

  findResourceById(id: string): Resource {
    const resource = this.envelope.graph.getResource(id);
    if (!resource) {
      throw new Error(`Resource with ID '${id}' not found`);
    }
    return resource;
  }

  getMilestoneIds(): string[] {
    return getMilestoneIds(this.resources);
  }

  getTasksByMilestone(): Map<string, Resource[]> {
    return getTasksByMilestone(this.envelope.graph);
  }

  // TODO currently implemented with a sensible default traverse
  // but eventually needs to support a more expressive query interface
  getDependencyTree(rootId: string): DependencyTree {
    // By default, treat milestone nodes (except the root) as leaves when
    // expanding from a root resource. This mirrors CLI/listing behavior
    // where milestones act as grouping nodes and are not expanded further
    // in dependency trees unless explicitly requested. Also filter out
    // resources whose status is complete.
    const traversePredicate = (r: Resource) => {
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
