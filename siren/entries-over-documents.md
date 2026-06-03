# Entries Over Documents — Implementation Plan

Tracked in: `siren/entries-over-documents.siren`  
ADR: `docs/adr/0005-entries-over-documents-core.md`

---

## Motivation

`SirenDocument` and `SirenDocumentDirective` are file-system and parsing concerns that were modelled as first-class semantic inputs in `@sirenpm/core`. Core's job is the entry graph and semantic validation; how entries were grouped into source files — and whether a file earns a convenience grouping milestone — is a decode-time and authoring concern. This split forced core to carry a document type, a synthesis module, and document-grouped patch bookkeeping that the primary consumer (`@sirenpm/language`) already bypassed by hard-coding `implicitMilestone: false` on every decoded document.

This plan removes `SirenDocument` from core entirely, reshapes the builder and patch surface around flat `SirenEntry` inputs, and relocates per-file milestone synthesis into the language decoder as default-off syntax sugar.

---

## Scope

### Included

- Core builder, patch/delta, context construction, and pipeline topology changes.
- Core public export surface: remove `SirenDocument` and `DocumentChange`.
- Language decoder output shape change (`documents` → `entries`).
- Language synthesis relocation: wired into `decodeSyntaxDocuments` behind a default-off `synthesizeMilestones` option.
- Language export surface: replace the dead `renderSirenDocument` with `renderEntry`.
- CLI lifecycle bridge: rename `sirenDocuments` to `sirenEntries`, switch to `SirenBuilder.fromEntries`.
- Test migration for all touched public surfaces.
- A breaking 0.x publish for `@sirenpm/core` and `@sirenpm/language`.

### Excluded

- Changing `Origin` out of core. `RangeOrigin.document` and `SyntheticOrigin` remain as shared IR vocabulary for now. Future removal is acknowledged but out of scope.
- Turning synthesis on for real parsed documents. The language-side hook is wired but its default is `false` until grammar support exists.
- Dependency-reduction or hierarchy-recovery logic for the language-side synthetic milestone. That is a future pipeline module.
- Any new user-facing grammar syntax for enabling synthesis. The decoder option is the bridge until then.

---

## Key Decisions

These were resolved in the planning session preceding this implementation.

**Core input is flat `readonly SirenEntry[]`.** No grouping unit exists in core. Grouping is reconstructable from `origin.document` if ever needed.

**Builder surface.** `fromEntries(entries)` is the single primary constructor. `fromDocuments`, `withDocument`, `patchDocument`, and the `ephemeralDocumentId` parameter are deleted. `withEntry(entry)` becomes a plain flat append. `patch(fn)` and `patchEntry(id, fn)` remain but operate on entry arrays.

**Patch/delta.** `PatchResult.changes` is `EntryChange[]` only. `DocumentChange` and `directiveChanged` are deleted. `computeDelta` takes `(oldEntries, newEntries)`.

**Pipeline seed.** The core pipeline seeds `{ rawEntries }` and starts at `DedupModule`. `SynthesisModule` is deleted.

**Synthesis ownership.** The synthesis capability moves to `@sirenpm/language`, wired into `decodeSyntaxDocuments(...)` behind a default-off `synthesizeMilestones` boolean option. The rationale for wiring (rather than leaving it dormant) is that it is testable in isolation and establishes the clear path to grammar support.

**Synthesis semantics.** The language-side synthetic milestone depends on **all** entries decoded from the source document, not just roots. Root-detection is dropped entirely. Completion roll-up remains equivalent. The dependency tree shape flattens for the synthetic milestone (each entry is a direct child rather than in a hierarchy); dependency-reduction is a future module.

**Renderer surface.** `renderSirenDocument` is dead: it has no internal callers and reads a stale `.resources` field. It is removed. `renderEntry(entry: SirenEntry): string` is introduced using the existing block-building logic. Callers render collections by mapping over entries.

**CLI output unchanged.** Because `synthesizeMilestones` defaults to `false`, no new milestones appear in CLI output. All golden tests must pass without change.

---

## Phase 1 — `@sirenpm/core`

### Files changed

| File | Change |
|---|---|
| `packages/core/src/ir/assembly.ts` | Replace document-shaped construction with entry-shaped. Primary constructor becomes `fromEntries`. Remove `fromDocuments`, `withDocument`, `patchDocument`, and the `ephemeralDocumentId` branch from `withEntry`. Rename internal snapshot field. |
| `packages/core/src/ir/patch-result.ts` | Collapse to entry-level: `EntryChange[]` only, delete `DocumentChange` and `directiveChanged`. Rewrite `computeDelta(oldEntries, newEntries)`. |
| `packages/core/src/ir/document.ts` | Delete. |
| `packages/core/src/ir/context.ts` | Change `SirenProject` constructor to accept `readonly SirenEntry[]` directly. |
| `packages/core/src/ir/pipeline/index.ts` | Seed `{ rawEntries }`, drop `SynthesisModule`, start chain at `DedupModule`. Refresh topology comment. |
| `packages/core/src/ir/pipeline/modules/synthesis.ts` | Delete. |
| `packages/core/src/ir/pipeline/modules/synthesis.test.ts` | Delete. |
| `packages/core/src/ir/pipeline/modules/dedup.ts` | Update input type to consume flat entries from envelope. |
| `packages/core/src/ir/pipeline/modules/graph.ts` | Update input type to consume flat entries from envelope. |
| `packages/core/src/ir/index.ts` | Remove `SirenDocument` and `DocumentChange` from exports. |
| `packages/core/src/index.ts` | No direct change needed; inherits via `export * from './ir/index'`. |

### Tests changed

| File | Change |
|---|---|
| `packages/core/src/ir/assembly.test.ts` | Rewrite around entry-based construction, cloning, patching, freezing. |
| `packages/core/test/assembly-patch.test.ts` | Rewrite for entry-level delta and mutation. |
| `packages/core/test/patch-result.test.ts` | Delete or repurpose if only validates document-grouped delta. |
| `packages/core/src/ir/pipeline/pipeline.test.ts` | Remove `SynthesisModule` expectations; assert new topology. |
| `packages/core/test/extended-passthrough.test.ts` | Remove any `.documents` assertions; update to `.entries` API. |
| `packages/core/src/index.test.ts` | Remove `fromDocuments`/`DocumentChange` surface assertions. |

### TDD loop

Write all the new assertions first and confirm they fail against the current implementation before making any source changes. The pipeline test asserting "no `documents` key in seed" and "SynthesisModule is not in the runner steps" should be added alongside the builder/delta tests.

---

## Phase 2 — `@sirenpm/language`

Depends on the core publish releasing `fromEntries`.

### Files changed

| File | Change |
|---|---|
| `packages/language/src/decoder/index.ts` | Change `DecodeResult` shape: `documents` field replaced by `entries: readonly SirenEntry[] \| null`. Add `synthesizeMilestones?: boolean` option to `decodeSyntaxDocuments`. Implement synthesis helper: per source document, append a synthetic milestone with `id = document.source.name`, `type: 'milestone'`, and `depends_on` referencing all entries decoded from that document. Remove `DecodedDocument` deprecated alias. |
| `packages/language/src/context-factory.ts` | Call `SirenBuilder.fromEntries(entries ?? [])`. Thread `synthesizeMilestones` option through `createSirenProjectFromSyntaxDocuments` and `createSirenProjectFromParseResult`. |
| `packages/language/src/export/render-document.ts` | Replace `renderSirenDocument(document)` with `renderEntry(entry: SirenEntry): string`. Reuse existing per-block logic for type, id, status token, and attributes. |
| `packages/language/src/index.ts` | Stop re-exporting `renderSirenDocument`. Export `renderEntry` in its place. Update `DecodeResult` re-export shape. |

### Tests changed

| File | Change |
|---|---|
| `packages/language/test/export/render-document.test.ts` | Rewrite for `renderEntry` (or delete if renderer becomes private). |
| Decoder integration tests | Assert `DecodeResult.entries` is a flat array. Assert `synthesizeMilestones: true` produces one synthetic milestone per document with the expected `depends_on`. |

### Fixture coverage

Add or adjust a fixture under `packages/language/test/fixtures/projects/` only if the synthesis-enabled path needs a regression case that existing fixtures do not cover. The default-off path must produce identical output to today's decoder, so no fixture updates are required for that path.

---

## Phase 3 — `@sirenpm/cli`

Depends on the language publish releasing the new `DecodeResult.entries` shape.

### Files changed

| File | Change |
|---|---|
| `apps/cli/src/lifecycle/context.ts` | Rename lifecycle state field from `sirenDocuments` to `sirenEntries`. Update type from `readonly SirenDocument[]` to `readonly SirenEntry[]`. |
| `apps/cli/src/lifecycle/decoding.ts` | Store `entries` from `DecodeResult` instead of `documents`. |
| `apps/cli/src/lifecycle/building.ts` | Call `SirenBuilder.fromEntries(ctx.sirenEntries)`. |

### Tests

Golden tests in `apps/cli/test/golden.test.ts` must pass without any expected-output updates. Any diff is a regression.

---

## Verification

Run tests in phase order to catch regressions before widening scope.

```bash
# After Phase 1
yarn workspace @sirenpm/core tsc --noEmit
yarn workspace @sirenpm/core test -t "assembly|patch|pipeline"

# After Phase 2
yarn workspace @sirenpm/language tsc --noEmit
yarn workspace @sirenpm/language test -t "decoder|render"

# After Phase 3
yarn workspace @sirenpm/cli tsc --noEmit
yarn workspace @sirenpm/cli test

# Full repo
yarn test
```

If a focused check fails, fix the same phase before proceeding. Any golden diff is a regression; do not update golden files to pass — fix the source.

---

## Assumptions

1. The `@sirenpm/core` and `@sirenpm/language` packages are published to the npm registry as new 0.x releases before the CLI is updated, consistent with the monorepo's `enableTransparentWorkspaces: false` policy.
2. There are no external consumers of `SirenDocument`, `DocumentChange`, or `renderSirenDocument` beyond this monorepo. (Verified: all consumers are within `packages/language` and `apps/cli`.)
3. The synthesis helper in language emits `SyntheticOrigin` on the generated milestone, consistent with the existing `origin: { kind: 'synthetic', document: document.id }` convention established by the deleted core synthesis module.
