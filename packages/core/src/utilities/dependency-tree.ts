import type { Resource } from '../ir/types';

/**
 * Controls how a node is traversed in the dependency tree.
 * - include: Should this node appear in the tree?
 * - expand: Should we traverse its children?
 */
export interface TraversalControl {
  include: boolean;
  expand: boolean;
}

/**
 * Predicate that controls tree traversal.
 * Returns:
 * - `false` → exclude node entirely (shorthand for { include: false, expand: false })
 * - `true` → include and expand (shorthand for { include: true, expand: true })
 * - `TraversalControl` → explicit control over inclusion and expansion
 */
export type TraversePredicate = (
  resource: Resource,
  parent?: Resource,
) => boolean | TraversalControl;

export interface DependencyTree {
  resource: Resource;
  dependencies: DependencyTree[];
  /** If true, this node represents a detected cycle */
  cycle?: boolean;
  /** If true, this node represents a missing referenced resource */
  missing?: boolean;
}
