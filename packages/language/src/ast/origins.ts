import type { AstAttribute, AstResource } from './types';

/**
 * Local shim of core's `RangeOrigin` shape.
 *
 * Structurally identical to `RangeOrigin` in `@sirenpm/core` (`packages/core/src/ir/types.ts`).
 * We re-declare it here rather than importing because the current published
 * `@sirenpm/core` does not re-export `RangeOrigin` from its public surface.
 * Once core is republished with the re-export, swap this for the imported
 * type — see follow-up `lang-range-origin-core-import` in `siren/language-ast-pipeline.siren`.
 */
export interface RangeOrigin {
  readonly kind: 'range';
  readonly startByte: number;
  readonly endByte: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly document?: string;
}

/**
 * Package-private sidechannel mapping AST nodes (resources and attributes) to
 * their source `RangeOrigin`. The map is intentionally NOT part of the public
 * AST shape (see ADR 0004, Decision 13: the AST is span-free) and is NOT
 * re-exported from `@sirenpm/language`. The decoder consumes it to attach
 * origin metadata to IR resources/attributes without re-introducing CST
 * coupling.
 */
export type AstOriginMap = WeakMap<AstResource | AstAttribute, RangeOrigin>;
