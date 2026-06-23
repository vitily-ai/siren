/**
 * Intermediate Representation (IR) types for Siren
 *
 * These types represent the semantic model after parsing and validation.
 * They are environment-agnostic and used by all consumers of @sirenpm/core.
 */

/**
 * Reference to another entry by ID
 */
export interface EntryReference {
  readonly kind: 'reference';
  readonly id: string;
}

/**
 * A single atomic value that can appear inside an attribute Tuple.
 *
 * Scalars are encoded directly; references are objects with `kind: 'reference'`.
 * `null` is intentionally NOT an atom — absence is encoded as the empty Tuple.
 */
export type Atom = string | number | boolean | EntryReference;

/**
 * A Tuple is an ordered, readonly sequence of atoms.
 *
 * Scalar attribute values are single-element tuples; list-valued attributes
 * are multi-element tuples; absence is the empty tuple.
 */
export type Tuple = readonly Atom[];

/**
 * A single attribute (key-value pair). The value is always a Tuple.
 */
export interface Attribute {
  readonly key: string;
  readonly value: Tuple;
}

/**
 * Entry types supported by Siren
 * Extensible for future types
 */
export type EntryType = 'task' | 'milestone';

/**
 * Explicit entry status values captured in the IR.
 *
 * Status is optional on entries for this milestone:
 * - `undefined` means no explicit status was declared.
 * - `draft` preserves an explicit draft declaration.
 * - `complete` preserves an explicit completion declaration.
 *
 * Later pipeline modules may derive completion from dependencies and
 * materialize that state in `status`.
 */
export type EntryStatus = 'draft' | 'complete';

/**
 * A Siren entry (task or milestone)
 */
export interface SirenEntry {
  readonly type: EntryType;
  readonly id: string;
  /**
   * Optional explicit status declared on the entry.
   *
   * This may be absent when no status keyword is present. Explicit `draft`
   * must remain representable; completion may also be derived by later
   * pipeline modules.
   */
  readonly status?: EntryStatus;
  readonly attributes: readonly Attribute[];
}

/**
 * A detected cycle in the dependency graph
 */
export interface Cycle {
  /** Nodes involved in the cycle, in order */
  /**
   * Nodes involved in the cycle, in order.
   *
   * NOTE: the canonical representation includes the starting node again
   * at the end to make the cycle explicit (e.g. ['a', 'b', 'c', 'a']).
   */
  readonly nodes: readonly string[];
  /** Edges in the cycle (optional, for detailed analysis) */
  readonly edges?: readonly [string, string][];
}

/**
 * Type guard: narrows an Atom to an EntryReference.
 */
export function isReference(atom: Atom): atom is EntryReference {
  return typeof atom === 'object' && atom !== null && 'kind' in atom && atom.kind === 'reference';
}

export interface EntryStats {
  readonly deps: {
    readonly total: number;
    readonly closed: number;
    // TODO tree stats
  };
}

export type EntryWithStats = SirenEntry & {
  readonly stats: EntryStats;
};

export interface ProjectStatus {
  open: readonly EntryWithStats[];
  closed: readonly EntryWithStats[];
  draft: readonly EntryWithStats[];
}
