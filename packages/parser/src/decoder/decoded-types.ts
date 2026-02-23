import type { Attribute, Resource } from '@siren/core';
import type { Origin } from '../parser/cst.js';

/**
 * Parser-internal extension of Resource with origin metadata.
 * The `_origin` field is a parser-specific property not part of the core API.
 */
export interface DecodedResource extends Resource {
  readonly _origin?: Origin;
}

/**
 * Parser-internal extension of Attribute with raw text and origin metadata.
 * The `_raw` and `_origin` fields are parser-specific properties not part of the core API.
 */
export interface DecodedAttribute extends Attribute {
  readonly _raw?: string;
  readonly _origin?: Origin;
}
