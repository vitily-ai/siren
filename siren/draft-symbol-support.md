# draft-symbol-support — plan

Promote the grammar's single `complete` bare-keyword slot into an open,
repeatable status-modifier slot. The result is a grammar that accepts any bare
identifier in the modifier position, paired with a CST→Syntax linting pass that
collapses and validates those tokens before they reach the decoder.
**Core (`@sirenpm/core`) is not touched.** `ResourceStatus` stays
`'complete' | 'draft' | undefined` throughout.

---

## Decisions

### Syntax surface

Bare-keyword form only (`task foo draft {}`). The attribute form
(`status = "draft"`) is not a supported authoring path; WL001 catches it.

### Grammar permissiveness

`optional(field('complete_modifier', 'complete'))` → `repeat(field('status_modifier', $.bare_identifier))`.
Accepting *any* bare identifier in the modifier slot is intentional — it
follows the "permissive grammar + linting pass" pattern, where the grammar
never hard-fails on an unexpected token and validation is a discrete layer.

A reserved-keyword precedence rule must ensure that `task` and `milestone`
literals are never consumed as status modifiers when they appear on the
following line.

### Multi-token resolution: last-wins

When multiple tokens are present (`task foo draft complete {}`) the last
token in source order wins. This is committed now so the dependent
`multiple-statuses-diagnostic` milestone inherits a stable rule rather than
introducing a breaking change.

### Unknown-status tokens

Tokens not in `{complete, draft}` are caught in the lint pass:
- **WL003 (repurposed)** is emitted — `"unknown status keyword '<x>' on
  resource '<id>'; status will be ignored"`.
- The unknown token is dropped from `SyntaxResource.statusKeyword`.
- IR `Resource.status` remains `undefined` for that resource.

WL003 was previously unreachable (it fired only when a resource type other
than `task`/`milestone` carried the `complete` keyword — a configuration
impossible in the closed grammar). Its repurposing is a **breaking
diagnostic-code semantics change** and must be noted in the changeset.

### Diagnostic fates

| Code  | Before                                        | After                                                                              |
|-------|-----------------------------------------------|------------------------------------------------------------------------------------|
| WL001 | keyword + `complete = false` attribute        | Keyword + `status = "..."` attribute mismatch **or** attribute-only `status = "..."` (no keyword); attribute is dropped, keyword wins on mismatch |
| WL002 | `complete` keyword specified more than once   | Multiple status keywords on a resource; message names the winning (last) status    |
| WL003 | Resource type doesn't support `complete` (was unreachable) | **Repurposed**: unknown status identifier in modifier slot                |

### Out of scope

- Widening `ResourceStatus` to `string` / user-defined status values.
- WL002 → WL004 supersession — owned by the downstream
  `multiple-statuses-diagnostic` milestone.
- Implicit-draft semantics (`implicit-draft-milestones`, `implicit-draft-tasks`).
- Contradictory-completion diagnostic.

---

## Task sequence

```
draft-states (complete)
  └─ draft-symbol-grammar-red
       └─ draft-symbol-grammar-green
            └─ draft-symbol-cst-types
                 └─ draft-symbol-lint-pass          ← multiple-statuses-diagnostic unblocks here
                      └─ draft-symbol-decoder
                           └─ draft-symbol-exporter
                                └─ draft-symbol-cli-goldens
                                     └─ draft-symbol-publish

draft-symbol-backlog-rewire (complete, parallel)
```

### draft-symbol-grammar-red
Add failing `packages/language/test/fixtures/snippets/` cases:
- `task foo draft {}` — basic draft token.
- `task foo draft complete {}` — multi-token (last-wins → `complete`).
- `task foo bogus {}` — unknown status token.
- Precedence regression: a resource with no status followed immediately by a
  `task`/`milestone` keyword on the next line does not consume the keyword
  as a modifier.

### draft-symbol-grammar-green
In `packages/language/grammar/grammar.js`:
- Rename the `complete_modifier` field to `status_modifier`.
- Replace `optional(field('status_modifier', 'complete'))` with
  `repeat(field('status_modifier', $.bare_identifier))`.
- Add a precedence rule (or restrict the token class via a regex that excludes
  reserved words) so `task` / `milestone` literals win over `$.bare_identifier`
  when appearing after a resource identifier in the modifier position.
- Rebuild with the tree-sitter-cli skill and commit the updated
  `packages/language/grammar/tree-sitter-siren.wasm`.

If the precedence work proves invasive, fall back to closed enumeration
(`choice('complete', 'draft')`) and defer the open-identifier design to a
follow-up milestone.

### draft-symbol-cst-types
Files to update:
- `packages/language/src/syntax/types.ts` — rename `completeKeyword?: SyntaxToken`
  to `statusKeyword?: SyntaxToken`.
- `packages/language/src/syntax/builder.ts` — replace `findCompleteKeywordToken`
  (returns a single token or undefined) with `findStatusKeywordTokens` (returns
  an array); expose the full list so the lint pass can consume it.
- `packages/language/src/parser/factory.ts` — rename `complete_modifier` field
  reads to `status_modifier`; retire the `isDuplicateComplete` / `duplicate
  'complete' keyword` error-recovery glue, since duplicate tokens are now
  first-class CST data and no longer arrive via ERROR recovery.
- `packages/language/src/context-factory.ts` — remove the
  `isDuplicateCompleteParseError` path and its WL002 emission; the lint pass
  takes over.

### draft-symbol-lint-pass
The lint pass runs between CST builder output and `SyntaxResource` finalization:

1. Collect the `statusKeyword` token list from the CST builder.
2. If `length > 1`: emit WL002 with message
   `"resource '<id>' has multiple status keywords; treated as '<last>'"`.
   Pick the last token as the winner.
3. For the winning token (or the sole token): validate against `{complete,
   draft}`. If unknown: emit WL003 with message
   `"unknown status keyword '<token>' on resource '<id>'; status will be
   ignored"`. Set `statusKeyword` to `undefined`.
4. Expose the resulting single (or absent) `SyntaxResource.statusKeyword`.

Add `packages/language/test/fixtures/projects/` entries covering:
- single `draft` token round-trip,
- multi-token resolution,
- unknown token + WL003 diagnostic.

### draft-symbol-decoder
In `packages/language/src/decoder/index.ts`:

- Replace `const complete = node.completeKeyword !== undefined` with
  `const status = node.statusKeyword?.text as ResourceStatus | undefined`.
- Set `status: status` on the returned `Resource`.
- Evolve WL001:
  - Fire when a `status = "..."` attribute is present and `status` keyword is
    also present but their values mismatch; keyword wins.
  - Also fire (with a slightly different message) when `status = "..."` appears
    with *no* keyword present; attribute is ignored.
- Delete the WL003 emission site (it now belongs to the lint pass).

Update `packages/language/test/fixtures/projects/` and decoder unit tests.

### draft-symbol-exporter
Files to audit:
- `packages/language/src/export/render-document.ts` — already status-aware
  (`resource.status ? \` ${resource.status}\` : ''`). No change expected; add
  a round-trip fixture confirming `draft` passes through correctly.
- `packages/language/src/export/siren-exporter.ts` line ~103 —
  `res.status === 'complete'` → `isComplete(res)` from `@sirenpm/core`.
- `packages/language/src/export/comment-exporter.ts` line ~245 — same.
- `packages/language/src/export/formatters.ts` lines ~73–77 — the `complete:
  boolean` parameter becomes `status: ResourceStatus | undefined`; update
  `headerBase` accordingly.
- `packages/language/src/format/syntax-formatter.ts` line ~83 —
  `resource.completeKeyword ? ' complete' : ''` → `resource.statusKeyword ?
  \` ${resource.statusKeyword.text}\` : ''`.

### draft-symbol-cli-goldens
Add golden files under `apps/cli/test/expected/` for a project that uses
`draft` status resources. Cover at minimum: `siren list`, `siren show`,
`siren format`, and `siren dependency-tree`. `apps/cli` is in the changeset
`ignore` list so no version bump, but goldens must reflect the new behavior.

### draft-symbol-publish
Add `.changeset/<slug>.md` for `@sirenpm/language` with a **minor** bump:
```md
---
"@sirenpm/language": minor
---
Add draft status keyword support to the grammar and decoder.
Resources can now be declared with `task foo draft {}` syntax.
BREAKING (diagnostic): WL003 is repurposed from the unreachable
"unsupported resource type" case to "unknown status keyword"; any tooling
that keyed on WL003's old message must be updated.
```

### draft-symbol-backlog-rewire *(complete)*
Explode the `draft-symbol-support` draft milestone into the dependency-ordered
tasks above in `siren/draft-states.siren`; retarget
`multiple-statuses-diagnostic.depends_on` from the full milestone to the
specific `draft-symbol-lint-pass` task.

---

## Verification checklist

1. `yarn workspace @sirenpm/language test` — all snippet, project, decoder, and
   exporter suites pass.
2. `yarn workspace @sirenpm/cli test` — CLI goldens for a draft-using project
   match.
3. Manual round-trip: a `.siren` file with `task foo draft {}`,
   `milestone m draft complete {}`, and `task n bogus {}` through `siren format`
   and `siren show` should: preserve `draft`, report generalized WL002 naming
   `complete` as the winner, report WL003 for `bogus`.
4. `yarn build && yarn test` from repo root passes.
5. `grep -r 'complete_modifier\|completeKeyword\|findCompleteKeywordToken\|isDuplicateComplete'`
   workspace-wide returns zero hits outside historical comments.
