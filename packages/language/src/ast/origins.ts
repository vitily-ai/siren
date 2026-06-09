import type { RangeOrigin } from '../origin';
import type { AstAttribute, AstResource } from './types';

/**
 * Package-private sidechannel mapping AST nodes (resources and attributes) to
 * their source `RangeOrigin`. The map is intentionally NOT part of the public
 * AST shape (see ADR 0004, Decision 13: the AST is span-free) and is NOT
 * re-exported from `@sirenpm/language`. The decoder consumes it to attach
 * origin metadata to IR resources/attributes without re-introducing CST
 * coupling.
 */
export type AstOriginMap = WeakMap<AstResource | AstAttribute, RangeOrigin>;
