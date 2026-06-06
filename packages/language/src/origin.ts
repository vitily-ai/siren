import type { Attribute, SirenEntry } from '@sirenpm/core';

/**
 * Language-native Origin types.
 *
 * Core v0.6.0 removed `RangeOrigin`, `SyntheticOrigin`, and `Origin` from its
 * public surface. The language package now owns these types and provides
 * structural extensions (`SourcedEntry`, `SourcedAttribute`) that attach origin
 * metadata to core IR types without modifying core.
 */

export interface OriginBase<Kind extends string = string> {
  readonly kind: Kind;
  readonly document: string;
}

/**
 * Source-range origin pointing to concrete positions in a document.
 */
export interface RangeOrigin extends OriginBase<'range'> {
  readonly kind: 'range';
  readonly startByte: number;
  readonly endByte: number;
  readonly startRow: number;
  readonly endRow: number;
}

/**
 * Synthetic origin for generated entries anchored to a document.
 */
export interface SyntheticOrigin extends OriginBase<'synthetic'> {
  readonly kind: 'synthetic';
  readonly document: string;
}

export type Origin = RangeOrigin | SyntheticOrigin;

/**
 * A core `SirenEntry` extended with a required language-native `origin`.
 */
export interface SourcedEntry extends SirenEntry {
  readonly origin: Origin;
}

/**
 * A core `Attribute` extended with a required language-native `origin`.
 */
export interface SourcedAttribute extends Attribute {
  readonly origin: Origin;
}
