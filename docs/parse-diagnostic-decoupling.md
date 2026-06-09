# Parse Diagnostic Decoupling

## Overview

Replace the monolithic `extractErrors()` oracle in `packages/language/src/parser/factory.ts` with a small, rule-based diagnostic runtime. The prerequisite change is dropping multi-document concatenated parsing, which eliminates the `DocumentBoundary` plumbing that permeates the whole conversion layer. After that, two diagnostic rules replace the five embedded cases in `extractErrors`, and all dead code is removed.

This document covers rationale, decisions, accepted regressions, technical specification for each implementation task, and the verification procedure.

---

## Background and Motivation

### The current architecture

`factory.ts` implements a single monolithic `buildAdapter(parser)` that contains:

- **CST conversion** (`convertDocument`, `convertResource`, `convertAttribute`, `convertExpression`, …) — walks the tree-sitter CST and produces typed CST nodes. Hardcodes ~40 tree-sitter node type strings. This coupling is a separate concern and is **out of scope** for this refactor.
- **`extractErrors(node, boundaries, documents)`** — walks the tree for error nodes and emits `ParseError` objects. Contains five embedded, hard-coded rules.
- **`extractComments(root, source, boundaries)`** — collects comment tokens.
- **`parse(documents)`** — concatenates all `SourceDocument`s into one string, parses the combined string, and maps byte offsets back to per-document coordinates via `DocumentBoundary[]`.

### Why `extractErrors` is the problem

`extractErrors` is the sole point in the language package where parse-phase diagnostic logic lives. It is also the most tightly coupled to grammar topology:

1. **Rule 2 (duplicate `complete`):** checks `node.parent.type === 'resource'` and `node.parent.childForFieldName('complete_modifier') != null`.
2. **Rule 3 (top-level unexpected token):** climbs `node.parent` until it escapes ERROR containers, then checks `nearestNonErrorParent.type === 'document'`.
3. **Rules 1, 4, 5:** comparatively benign, but embedded in the same monolith.

The effect: every grammar restructuring that changes intermediate non-terminal node names, parent types, or field names risks silently breaking diagnostic logic. Changing `resource_header` to something else, or adding a wrapper rule, means grep-searching `extractErrors` for the old name and hoping nothing was missed.

The CST conversion layer is *already* well-insulated — Layers 2 and 3 (syntax builder, IR decoder) have no tree-sitter node type strings. `extractErrors` is the lagging exception.

### Why multi-document concatenation is the prerequisite

Every function in the conversion/extraction pipeline carries a `boundary: DocumentBoundary` parameter to map global byte offsets back to per-document line/column. This pervasive offset arithmetic:

- Adds accidental complexity to every node position extraction.
- Produces a cross-document side effect: an unclosed brace in `a.siren` causes the parser to consume the start of `b.siren` into one giant ERROR, and the boundary-spill rule then fabricates a synthetic error at byte 0 of `b.siren`. This is misleading — the real error is the unclosed brace in `a.siren`.
- Prevents independent error recovery: if one document is malformed, it can corrupt position attribution for all subsequent documents in the batch.

Parsing each `SourceDocument` independently (one tree per document) eliminates the boundary layer and all offset arithmetic. The boundary-spill synthetic error becomes physically impossible (and wasn't useful anyway). Post-refactor, each document's positions are read directly from tree-sitter nodes with no offset subtraction.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rule shape | Visitor-style (per-rule functions dispatched by event kind) | Modular; straightforward to read and test individually. |
| What rules see | Narrowed grammar-agnostic context | Rules may inspect leaf `nodeType` strings (e.g., `'}'`, `'bare_identifier'`) but not `node.parent`, `node.childForFieldName`, or any tree-traversal method. This removes the topology coupling while preserving the ability to distinguish missing `}` from missing identifier. |
| Rule file location | New flat file `packages/language/src/parser/diagnostics.ts` | Two rules + a small runtime don't warrant a subdirectory. The flat file is discoverable and self-contained. |
| `ParseError` shape | Unchanged | Minimal blast radius on downstream consumers (`context-factory.ts`, CLI formatter). `severity` will always be `'error'` in practice after dropping the duplicate-complete warning; `expected` will always be `[]` for unexpected-token events. |
| Multi-doc parsing | Drop; each document parses independently | Eliminates boundary plumbing; makes position extraction trivially correct; makes error attribution accurate. |

---

## Accepted Regressions

These behavioral changes are deliberate:

1. **Duplicate `complete` keyword** — currently emits a `warning` with message `duplicate 'complete' keyword; expected '{'`. After: emits a generic `error` with message `unexpected token 'complete'`. The specific message was only possible because the rule inspected `node.parent`. It was the only warning emitted from the parse phase.

2. **Top-level unexpected token** — currently emits `unexpected token 'foo'; expected 'task' or 'milestone'`. After: emits `unexpected token 'foo'` with no expected list. Determining "top-level" required climbing the parent chain to find a `document` node. A depth counter would re-create this structurally, but the explicit expected-keyword hint was considered not worth the complexity trade-off.

3. **Cross-document boundary-spill** — currently fabricates a synthetic error in `b.siren` when a parse error in `a.siren` causes the parser to swallow `b.siren`'s opening tokens. After: physically impossible once documents parse independently. This was misleading behavior; removing it is an improvement.

4. **Missing resource ID subcase** — currently distinguishes `bare_identifier` MISSING leaves that are resource identifiers (emits "expected identifier after resource type") from those in other positions (emits "expected expression"). The distinction required `isMissingResourceId()` which climbed the parent chain. After: emits the generic "expected identifier" for all `bare_identifier` MISSING cases. This is a minor UX regression for a rare error case.

---

## Phase 1: Drop Multi-Document Parsing

### 1a — Change `ParserAdapter.parse()` signature

**File:** `packages/language/src/parser/adapter.ts`

Change the `parse()` method on `ParserAdapter` from accepting `readonly SourceDocument[]` to a single `SourceDocument`:

```typescript
// Before
parse(documents: readonly SourceDocument[]): Promise<ParseResult>;

// After
parse(document: SourceDocument): Promise<ParseResult>;
```

`ParseResult` is unchanged in shape. The `syntaxDocuments` field on `ParseResult` is an array; after this change it will always contain exactly one `SyntaxDocument`.

This is a **breaking change** to `@sirenpm/language`'s public API surface. A minor version bump is required.

### 1b — Rewrite `parse()` and remove boundary plumbing from all convert functions

**File:** `packages/language/src/parser/factory.ts`

Rewrite the `parse()` method:

```typescript
async parse(document: SourceDocument) {
  const tree = (parser as unknown as { parse(s: string): unknown }).parse(document.content) as ...;
  if (!tree) throw new Error('parser returned null tree');
  const root = tree.rootNode;
  const hasError = Boolean(tree.hasError === true || root?.hasError === true);
  const errors = hasError ? extractErrors(root, document.content) : [];
  const documentNode = convertDocument(root, document);
  const comments = extractComments(root, document.content, document.name);
  const syntaxDocuments = buildSyntaxDocuments(documentNode, [document], comments);
  const success = !hasError;
  return { tree: documentNode, errors, success, comments, syntaxDocuments };
}
```

The `DocumentBoundary` interface, `findDocumentForByte()`, `extractOrigin()`'s boundary parameter, and all `boundary`/`boundaries` parameters throughout `convertDocument`, `convertResource`, `convertAttribute`, `convertIdentifier`, `convertLiteralDirect`, `convertReference`, `convertArray`, `convertLiteral`, `convertExpression`, `extractComments` must be removed.

Position extraction becomes:

```typescript
function extractOrigin(node: NodeLike | undefined, documentName: string) {
  if (!node) return undefined;
  const startPos = node.startPosition;
  const endPos = node.endPosition;
  if (!startPos || !endPos) return undefined;
  return {
    kind: 'range' as const,
    startByte: Number(node.startIndex ?? 0),
    endByte: Number(node.endIndex ?? 0),
    startRow: Number(startPos.row ?? 0),
    endRow: Number(endPos.row ?? 0),
    document: documentName,
  };
}
```

`convertDocument` no longer iterates over boundaries to assign each resource to a document — it passes `document.name` directly everywhere.

### 1c — Update CLI lifecycle

**File:** `apps/cli/src/lifecycle/parsing.ts`

Currently calls `parser.parse(sourceDocuments)` (passing all documents as an array). Must change to loop:

```typescript
const results: ParseResult[] = [];
for (const doc of sourceDocuments) {
  results.push(await parser.parse(doc));
}
```

The `ctx.parseResult` field (or its equivalent in the lifecycle context) must be updated to hold the merged/aggregated shape that downstream lifecycle stages (`decoding.ts`, `diagnostics.ts`, etc.) expect. Determine the least-invasive aggregation: likely merge `errors[]`, `comments[]`, and `syntaxDocuments[]` arrays across all results, and compute `success` as the logical AND of all results' `success` flags.

Check `apps/cli/src/lifecycle/decoding.ts` and `diagnostics.ts` to confirm they consume `ctx.parseResult.syntaxDocuments` (already an array) rather than relying on the single-parse batch shape.

### 1d — Update `format.ts` call sites

**File:** `apps/cli/src/commands/format.ts`

Two call sites at lines ~80 and ~99 already pass a single document wrapped in an array (`parser.parse(doc(source, relPath))`). Unwrap the array literal: `parser.parse({ name: relPath, content: source })` (or however `doc()` is defined).

Verify the helper function `doc()` in this file and inline or simplify if it just constructed a single-element array.

### 1e — Verify `context-factory.ts`

**File:** `packages/language/src/context-factory.ts`

`createSirenProjectFromParseResult()` receives a `ParseResult`. Confirm it does not use `parseResult.tree` in a way that assumed the multi-document concatenated shape (e.g., iterating over cross-document resources). If `parseResult.syntaxDocuments` is what it consumes, it is already array-based and correct.

### 1f — Rewrite multi-doc integration tests

**File:** `packages/language/test/integration/syntax-documents.test.ts`

Several test cases call `adapter.parse([docA, docB, ...])`. Rewrite each such case to call `adapter.parse(docA)` and `adapter.parse(docB)` separately and assert on each result independently. If any test was specifically asserting multi-document concatenation behavior (e.g., resources from both documents appearing in one tree), replace with equivalent per-document assertions.

---

## Phase 2: Per-Rule Diagnostic Runtime

### 2a — Define types in `diagnostics.ts`

**File:** `packages/language/src/parser/diagnostics.ts` (new)

```typescript
export type DiagnosticEventKind = 'missing' | 'errorLeaf';

export interface DiagnosticContext {
  kind: DiagnosticEventKind;
  /** The tree-sitter node type string (e.g., '}', 'bare_identifier', 'complete'). */
  nodeType: string;
  /** Source text from the document at this node's byte range. May be empty string for MISSING. */
  sourceText: string;
  startByte: number;
  endByte: number;
  startRow: number;
  startColumn: number;
  /** Full document source, for scanToken use by rules. */
  documentSource: string;
  /** Document name/id. */
  documentName: string;
}

export interface DiagnosticRule {
  name: string;
  appliesTo: DiagnosticEventKind | 'all';
  evaluate(ctx: DiagnosticContext): ParseError | null;
}
```

Rules receive only `DiagnosticContext`. They do not receive the tree-sitter node object and cannot call any tree-sitter API.

### 2b — Implement `runDiagnosticRules`

**File:** `packages/language/src/parser/diagnostics.ts`

```typescript
export function runDiagnosticRules(
  root: NodeLike,
  source: string,
  documentName: string,
  rules: readonly DiagnosticRule[],
): ParseError[] {
  const errors: ParseError[] = [];
  const seen = new Set<string>();

  const emit = (error: ParseError) => {
    const key = `${error.document}:${error.line}:${error.column}:${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(error);
  };

  const walk = (n: NodeLike | undefined) => {
    if (!n) return;
    const nType = String(n.type ?? '');
    const isMissing = Boolean(n.isMissing);
    const children = n.children ?? [];
    const isLeafError =
      nType === 'ERROR' && !children.some((c) => String(c.type ?? '') === 'ERROR');

    if (isMissing || isLeafError) {
      const kind: DiagnosticEventKind = isMissing ? 'missing' : 'errorLeaf';
      const startByte = Number(n.startIndex ?? 0);
      const endByte = Number(n.endIndex ?? startByte);
      const startRow = Number(n.startPosition?.row ?? 0);
      const startColumn = Number(n.startPosition?.column ?? 0);
      const ctx: DiagnosticContext = {
        kind,
        nodeType: nType,
        sourceText: source.slice(startByte, endByte),
        startByte,
        endByte,
        startRow,
        startColumn,
        documentSource: source,
        documentName,
      };

      for (const rule of rules) {
        if (rule.appliesTo !== 'all' && rule.appliesTo !== kind) continue;
        const result = rule.evaluate(ctx);
        if (result) emit(result);
      }
    }

    for (const child of children) walk(child);
  };

  walk(root);
  return errors;
}
```

The `seen` deduplication Set is preserved — it guards against the same physical position firing multiple rules or the same rule firing via multiple tree paths (e.g., nested ERROR nodes).

### 2c — Implement `missingTokenRule`

**File:** `packages/language/src/parser/diagnostics.ts`

```typescript
export const missingTokenRule: DiagnosticRule = {
  name: 'missing-token',
  appliesTo: 'missing',
  evaluate(ctx) {
    const expectedToken =
      ctx.nodeType === '}'
        ? '}'
        : ctx.nodeType === ']'
          ? ']'
          : ctx.nodeType === 'bare_identifier'
            ? 'identifier'   // regression accepted: was 'identifier after resource type' in the resource-id subcase
            : ctx.nodeType;

    return {
      severity: 'error',
      kind: 'missing_token',
      message: `expected ${expectedToken}`,
      expected: [expectedToken],
      line: ctx.startRow + 1,
      column: ctx.startColumn + 1,
      document: ctx.documentName,
      startByte: ctx.startByte,
      endByte: ctx.startByte, // MISSING nodes are zero-width
    };
  },
};
```

### 2d — Implement `unexpectedTokenRule`

**File:** `packages/language/src/parser/diagnostics.ts`

The rule uses `scanToken` (ported from factory.ts) to extract the human-readable token from raw source.

```typescript
export const unexpectedTokenRule: DiagnosticRule = {
  name: 'unexpected-token',
  appliesTo: 'errorLeaf',
  evaluate(ctx) {
    const scanned = scanToken(ctx.documentSource, ctx.startByte);
    const found = scanned.token;
    return {
      severity: 'error',
      kind: 'unexpected_token',
      message: `unexpected token '${found}'`,
      found,
      expected: [],
      line: ctx.startRow + 1,
      column: ctx.startColumn + 1,
      document: ctx.documentName,
      startByte: ctx.startByte,
      endByte: Math.min(ctx.startByte + scanned.length, ctx.documentSource.length),
    };
  },
};
```

Move `scanToken` out of `buildAdapter` (where it currently lives as a closure) so `diagnostics.ts` can import it without a circular dependency. Options: export it from `factory.ts`, or move it to a shared utility file. The simplest approach is to keep it as a module-level function in `diagnostics.ts` itself (no import needed since the file is self-contained).

### 2e — Wire rules into `factory.ts`

**File:** `packages/language/src/parser/factory.ts`

Replace:

```typescript
const errors = hasError ? extractErrors(root, boundaries, documents) : [];
```

With:

```typescript
const errors = hasError
  ? runDiagnosticRules(root, document.content, document.name, [missingTokenRule, unexpectedTokenRule])
  : [];
```

Import `runDiagnosticRules`, `missingTokenRule`, `unexpectedTokenRule` from `./diagnostics`.

---

## Phase 3: Test and Golden Updates

### 3a — Update CLI golden files

**Directory:** `apps/cli/test/expected/`

Run the golden test suite after Phase 2 to identify which golden files fail. Expected categories:

- **Duplicate `complete` scenarios** — golden shows `warning: duplicate 'complete' keyword; expected '{'`. Must be updated to `error: unexpected token 'complete'`.
- **Top-level unexpected token scenarios** — golden shows `expected 'task' or 'milestone'` suffix. Must be updated to drop the suffix.
- **Multi-document boundary-spill scenarios** — golden shows a synthetic error at line 1 column 1 of `b.siren`. Those errors disappear entirely.

Use `scripts/create-golden.sh` to regenerate goldens for affected test inputs, then review each diff to confirm it matches the expected behavioral changes before committing.

---

## Phase 4: Dead Code Cleanup

**File:** `packages/language/src/parser/factory.ts`

Remove from `factory.ts`:

- `DocumentBoundary` interface
- `findDocumentForByte()` function
- `isMissingResourceId()` function (no longer needed)
- `formatExpectedList()` function (no longer needed — `expected` list is always empty or a single element that doesn't need special formatting)
- `extractErrors()` function (replaced by `runDiagnosticRules`)
- All `boundary`/`boundaries` parameters on the `extractOrigin` signature and all conversion functions
- The `topLevelExpected` constant
- The `scanToken` function if it has been moved to `diagnostics.ts`

After removal, run a search for `boundary|Boundary|extractErrors|isMissingResourceId|formatExpectedList` in `packages/language/src` — result should be zero.

---

## Verification

1. `yarn workspace @sirenpm/language test` — all language unit and integration tests pass, including updated fixture assertions.
2. `yarn workspace @sirenpm/cli test` — all CLI golden tests pass after regeneration.
3. `yarn workspaces foreach -pv run test` — full suite green.
4. Manual smoke: `apps/cli` against the `siren/` workspace files with `siren list`, `siren show`, `siren format` — output unchanged for well-formed input.
5. Manual negative: introduce a syntax error (unclosed brace, stray keyword at top level) into a copy of any `siren/*.siren` file; run the CLI and confirm the new diagnostic messages appear at the correct line and column.
6. Confirm no `boundary|Boundary|extractErrors` references remain in `packages/language/src` after Phase 4.

---

## Relationship to Existing Debt Items

Two debt items in `siren/debt.siren` are related but remain independent:

- **`parse-daigs-col-0`** — "parse diagnostics all set a column position of 0." The Phase 1 change (removing boundary offset arithmetic) should naturally fix this, since the column is now read directly from `node.startPosition.column` without adjustment. Verify in Phase 3 and mark that debt item `complete` if confirmed fixed.
- **`parser-diagnostic-ownership`** — "Unify parse diagnostics under parser ownership." This refactor addresses the internal coupling inside the parser package but does not change the CLI's split between `formatParseError` and the `ParseDiagnostic` handoff path. That unification is a separate, follow-on concern.

---

## Out of Scope

The CST conversion layer (`convertDocument`, `convertResource`, `convertAttribute`, etc.) still hardcodes approximately 40 tree-sitter node type strings. That coupling is a real but separate concern and is explicitly excluded from this refactor.
