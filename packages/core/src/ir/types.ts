/**
 * Intermediate Representation (IR) types for Siren
 *
 * These types represent the semantic model after parsing and validation.
 * They are environment-agnostic and used by all consumers of @siren/core.
 */

import type { Origin } from '../parser/cst.js';

/**
 * Primitive value types that can appear in attributes
 */
export type PrimitiveValue = string | number | boolean | null;

/**
 * Reference to another resource by ID
 */
export interface ResourceReference {
  readonly kind: 'reference';
  readonly id: string;
}

/**
 * Array of values (primitives or references)
 */
export interface ArrayValue {
  readonly kind: 'array';
  readonly elements: readonly AttributeValue[];
}

/**
 * All possible attribute value types
 */
export type AttributeValue = PrimitiveValue | ResourceReference | ArrayValue;

/**
 * A single attribute (key-value pair)
 */
export interface Attribute {
  readonly key: string;
  readonly value: AttributeValue;
  /**
   * Optional raw text from the source CST for this attribute's value
   * (includes quotes for string literals when available).
   */
  readonly raw?: string;
  /**
   * Optional source origin information for comment-aware formatting.
   * This is not semantic and may differ across equivalent parses.
   */
  readonly origin?: Origin;
}

/**
 * Resource types supported by Siren
 * Extensible for future types
 */
export type ResourceType = 'task' | 'milestone';

/**
 * A Siren resource (task or milestone)
 */
export interface Resource {
  readonly type: ResourceType;
  readonly id: string;
  /**
   * True if the resource is marked complete via the 'complete' keyword (not attribute)
   */
  readonly complete: boolean;
  readonly attributes: readonly Attribute[];
  /**
   * Optional source origin information for comment preservation
   * Used by formatters to interleave comments with exported IR
   */
  readonly origin?: Origin;
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
 * Top-level document containing all resources
 */
export interface Document {
  readonly resources: readonly Resource[];
  /** Source file path (if any) */
  readonly source?: string;
  /** Detected cycles in the dependency graph */
  readonly cycles: readonly Cycle[];
}

/**
 * Type guards for AttributeValue discrimination
 */
export function isReference(value: AttributeValue): value is ResourceReference {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'reference'
  );
}

export function isArray(value: AttributeValue): value is ArrayValue {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'array';
}

export function isPrimitive(value: AttributeValue): value is PrimitiveValue {
  return !isReference(value) && !isArray(value);
}
