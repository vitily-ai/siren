/**
 * Parse Error Classifier
 *
 * Analyzes tree-sitter ERROR / MISSING CST nodes and produces structured
 * language diagnostics via a pluggable rule pipeline. Rules are tried in
 * declared order; the first match wins. When no rule matches, the fallback
 * `EL001` (default parse error) is emitted.
 *
 * ## Rule contract
 *
 * Each `ErrorRule` receives a CST node and a shared context. The node is
 * guaranteed to be an ERROR or MISSING node (i.e. `node.isError` or
 * `node.isMissing`). The rule returns a classified `LanguageDiagnostic` on
 * match, or `null` to pass control to the next rule.
 *
 * ## Adding new error modes
 *
 * 1. Define a new `ELXXXDiagnostic` interface in `diagnostics.ts` and add a
 *    factory (`createELXXX`).
 * 2. Implement an `ErrorRule` that inspects the CST node and returns the new
 *    diagnostic when its pattern matches.
 * 3. Insert the rule into the `DEFAULT_RULES` array (order matters — more
 *    specific rules before more general ones).
 */

import type { Language, Node } from 'web-tree-sitter';
import {
  createEL001,
  createEL002,
  createEL003,
  type EL001GenericParseErrorDiagnostic,
  type EL002MissingTokenDiagnostic,
  type EL003UnexpectedTokenDiagnostic,
  type LanguageDiagnostic,
} from '../diagnostics';
import type { RangeOrigin } from '../origin';
import type { SourceDocument } from '../parser/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Any classified parse-error diagnostic produced by a rule. */
export type ClassifiedParseError =
  | EL001GenericParseErrorDiagnostic
  | EL002MissingTokenDiagnostic
  | EL003UnexpectedTokenDiagnostic;

/** Shared context available to every `ErrorRule.match()` call. */
export interface RuleContext {
  readonly language: Language;
  readonly source: SourceDocument;
  /** Resource id when the error is inside a specific resource, else absent. */
  readonly resourceId?: string;
}

/**
 * A pluggable rule that inspects an ERROR or MISSING CST node and either
 * produces a classified diagnostic or returns `null` (no match — try next rule).
 */
export interface ErrorRule {
  /** Unique name for debugging and test selection. */
  readonly name: string;
  /**
   * Attempt to classify `node` (guaranteed `node.isError || node.isMissing`).
   * `origin` is already narrowed to this specific node.
   */
  match(node: Node, origin: RangeOrigin, ctx: RuleContext): LanguageDiagnostic | null;
}

// ---------------------------------------------------------------------------
// CST helpers
// ---------------------------------------------------------------------------

/** Build a `RangeOrigin` from a tree-sitter node. */
function originFromNode(node: Node, documentName: string): RangeOrigin {
  return {
    kind: 'range',
    startByte: node.startIndex,
    endByte: node.endIndex,
    startRow: node.startPosition.row,
    endRow: node.endPosition.row,
    document: documentName,
  };
}

/**
 * Depth-first search for the first ERROR or MISSING node in `parent`'s
 * subtree. Checks both named and unnamed children (tree-sitter places ERROR
 * nodes as unnamed children in some grammars). Returns `null` when the subtree
 * is clean.
 */
function findFirstErrorDescendant(parent: Node): Node | null {
  // Named children first — they're the "structural" nodes.
  for (let i = 0; i < parent.namedChildCount; i++) {
    const child = parent.namedChild(i);
    if (!child) continue;
    if (child.isError || child.isMissing) return child;
    const found = findFirstErrorDescendant(child);
    if (found) return found;
  }
  // Unnamed children — ERROR / MISSING sometimes live here.
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (!child) continue;
    if (child.isError || child.isMissing) return child;
  }
  return null;
}

/**
 * Walk to the first leaf (a node with zero children) in `node`'s subtree.
 * Used to obtain the parse state for `lookaheadIterator`.
 */
function firstLeaf(node: Node): Node {
  let current = node;
  while (current.childCount > 0) {
    current = current.child(0)!;
  }
  return current;
}

/**
 * Query the set of grammar symbols that are valid at the position of `node`.
 *
 * Tree-sitter's `Language.lookaheadIterator(stateId)` yields symbol names
 * starting with `ERROR` (the current state). We skip that first symbol and
 * return the remainder — the set of tokens the parser *could* have accepted.
 */
function expectedSymbolsAt(node: Node, language: Language): string[] {
  const leaf = firstLeaf(node);
  const stateId = leaf.parseState;
  const iter = language.lookaheadIterator(stateId);
  if (!iter) return [];

  const symbols: string[] = [];
  let isFirst = true;
  for (const sym of iter) {
    if (isFirst) {
      isFirst = false;
      // First symbol is always `ERROR` — the current unexpected state.
      continue;
    }
    symbols.push(sym);
  }
  return symbols;
}

/**
 * Filter a list of grammar symbols to keyword-like terminals that are
 * meaningful to show to users (e.g. `task`, `milestone`, `true`, `false`).
 *
 * Uses `isNamedType` (backed by `Language.idForNodeType`) to distinguish
 * anonymous string literals from named grammar rules. Anonymous symbols
 * are keyword terminals; named symbols are non-terminals like `document`,
 * `resource`, `bare_identifier`.
 *
 * Also excludes `comment` (always valid extras), `error` / `ERROR` (internal
 * sentinel), and the `missingToken` itself since it is already reported
 * as the primary missing element.
 */
export function keywordTerminalSymbols(
  symbols: readonly string[],
  missingToken: string,
  isNamedType: (name: string) => boolean,
): string[] {
  return symbols.filter((s) => {
    if (s === missingToken) return false;
    if (s === 'comment' || s === 'error' || s === 'ERROR') return false;
    // Only pure-alpha tokens are keyword-like terminals. Punctuation like
    // '=', ',', '[', ']' is also anonymous but isn't a useful suggestion.
    if (!/^[a-z]+$/.test(s)) return false;
    // Anonymous symbols (string literals like 'task', 'milestone') are
    // the user-facing keyword terminals. Named rules are internal grammar
    // names that should not be suggested.
    return !isNamedType(s);
  });
}

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

/**
 * Narrow a `RangeOrigin` to its first line only. Used for ERROR/MISSING nodes
 * that tree-sitter reports as spanning multiple lines (e.g., an ERROR covering
 * the rest of a document). EL002/EL003 rules receive the narrowed origin so
 * the caret points at the specific offending position, not the entire block.
 * The EL001 fallback retains the full multi-line origin.
 */
function firstLineOrigin(origin: RangeOrigin, source: SourceDocument): RangeOrigin {
  if (origin.endRow <= origin.startRow) return origin; // already single-line
  const content = source.content;

  // Advance past leading whitespace/newlines so the caret points at actual
  // content rather than a blank line.
  let startByte = origin.startByte;
  let startRow = origin.startRow;
  while (startByte < content.length) {
    const ch = content[startByte];
    if (ch === '\n') {
      startRow++;
      startByte++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      startByte++;
      continue;
    }
    break;
  }

  // Find the end of the first substantive line.
  const lineEnd = content.indexOf('\n', startByte);
  const endByte = lineEnd === -1 ? content.length : lineEnd;

  return {
    ...origin,
    startByte,
    startRow,
    endRow: startRow,
    endByte,
  };
}

/**
 * `missing-token` — matches tree-sitter MISSING nodes.
 *
 * A MISSING node is inserted when the grammar required a token that was absent
 * from the source. We report the token type that was missing.
 *
 * When the missing token is part of a grammar `choice` with alternatives, the
 * lookahead iterator may reveal additional valid symbols at this position.
 * Those are surfaced via the optional `expected` field on EL002 so the user
 * sees the full set of acceptable tokens.
 *
 * Priority: 1 (highest — MISSING tokens are the most actionable error).
 */
const missingTokenRule: ErrorRule = {
  name: 'missing-token',
  match(node, origin, ctx) {
    if (!node.isMissing) return null;
    const missingToken = node.type;

    // Gather expected alternatives at the MISSING position.
    // Tree-sitter docs advise using the previous non-extra leaf state for
    // MISSING nodes. Try the MISSING node itself first, then fall back to
    // the parent ERROR node if the iterator yields nothing.
    let symbols = expectedSymbolsAt(node, ctx.language);
    if (symbols.length === 0 && node.parent?.isError) {
      symbols = expectedSymbolsAt(node.parent, ctx.language);
    }
    const alternatives = keywordTerminalSymbols(
      symbols,
      missingToken,
      (name) => ctx.language.idForNodeType(name, true) !== null,
    );

    // Only surface alternatives when the missing token is itself a keyword
    // terminal (anonymous, alpha-only like 'task', 'milestone', 'true',
    // 'false'). Named missing tokens like 'bare_identifier' or 'block_close'
    // would produce confusing alternative lists in non-document contexts.
    const missingTokenIsKeyword =
      /^[a-z]+$/.test(missingToken) && ctx.language.idForNodeType(missingToken, true) === null;

    return createEL002({
      documentName: ctx.source.name,
      resourceId: ctx.resourceId,
      origin,
      missingToken,
      ...(alternatives.length > 0 && missingTokenIsKeyword
        ? { expected: [missingToken, ...alternatives] }
        : {}),
    });
  },
};

/**
 * `unexpected-token` — matches tree-sitter ERROR nodes that have a non-empty
 * set of expected alternatives via `lookaheadIterator`.
 *
 * When the lookahead returns symbols, we know what the parser *could* have
 * accepted at this position. When the set is empty, the rule defers to the
 * default EL001 fallback.
 *
 * Priority: 2.
 */
const unexpectedTokenRule: ErrorRule = {
  name: 'unexpected-token',
  match(node, origin, ctx) {
    if (!node.isError) return null;
    const expected = expectedSymbolsAt(node, ctx.language);
    if (expected.length === 0) return null;
    return createEL003({
      documentName: ctx.source.name,
      resourceId: ctx.resourceId,
      origin,
      expected,
    });
  },
};

/**
 * Ordered list of rules applied by the classifier. More specific rules come
 * first. When adding a new rule, insert it before the more general rules.
 */
export const DEFAULT_RULES: readonly ErrorRule[] = [missingTokenRule, unexpectedTokenRule];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a single ERROR or MISSING CST node by trying each rule in order.
 * Returns the first match, or an `EL001` fallback when no rule matches.
 *
 * When the node is an ERROR (not MISSING), the function first searches for a
 * MISSING descendant inside its subtree. MISSING tokens are the most
 * actionable — the parser knows exactly what was expected. If found, the
 * MISSING node is classified instead of the enclosing ERROR.
 */
export function classifyErrorNode(
  errorNode: Node,
  ctx: RuleContext,
  rules: readonly ErrorRule[] = DEFAULT_RULES,
): ClassifiedParseError {
  // Before trying the rule pipeline on the ERROR node itself, descend into
  // the subtree to find a MISSING descendant. A MISSING node carries the
  // exact token the grammar expected — far more actionable than the generic
  // unexpected-token set reported by the outer ERROR node.
  if (errorNode.isError) {
    const descendant = findFirstErrorDescendant(errorNode);
    if (descendant?.isMissing) {
      return classifyErrorNode(descendant, ctx, rules);
    }
  }

  const fullOrigin = originFromNode(errorNode, ctx.source.name);
  // Rules receive a single-line origin (narrowed to first line).
  // The EL001 fallback retains the full (potentially multi-line) origin.
  const narrowOrigin = firstLineOrigin(fullOrigin, ctx.source);

  for (const rule of rules) {
    const result = rule.match(errorNode, narrowOrigin, ctx);
    if (result) return result as ClassifiedParseError;
  }

  // Fallback: EL001 with the full origin.
  return createEL001({
    documentName: ctx.source.name,
    resourceId: ctx.resourceId,
    nodeType: errorNode.type,
    origin: fullOrigin,
  });
}

/**
 * Classify a resource node whose subtree contains parse errors.
 *
 * Descends into `resourceNode` to find the first ERROR or MISSING descendant,
 * then runs the rule pipeline on it. Falls back to `EL001` with the whole
 * resource span as origin when no specific error node can be located.
 */
export function classifyResourceSubtreeError(
  resourceNode: Node,
  resourceId: string | undefined,
  ctx: RuleContext,
  rules: readonly ErrorRule[] = DEFAULT_RULES,
): ClassifiedParseError {
  const errorDescendant = findFirstErrorDescendant(resourceNode);

  if (errorDescendant) {
    return classifyErrorNode(errorDescendant, { ...ctx, resourceId }, rules);
  }

  // No specific error node found — emit EL001 anchored at the whole resource.
  return createEL001({
    documentName: ctx.source.name,
    resourceId,
    nodeType: resourceNode.type,
    origin: originFromNode(resourceNode, ctx.source.name),
  });
}
