---
status: accepted
supersedes: 0004-siren-ast-language-boundary
---

# Core Uses Flat Entries Instead of Documents

Siren's semantic core will use flat `SirenEntry` sequences as the primary structural unit of a project.
`Document`-shaped construction input, document-grouped patch bookkeeping, and core-owned synthetic
milestone synthesis are all removed from `@sirenpm/core`.

The language package owns any file-oriented grouping or decode-time synthesis behavior. Core continues
to own semantic validation, dependency analysis, and the entry graph, but it no longer models source
files as a first-class semantic input.

## Context

The previous core design accepted `SirenDocument[]` and used that shape to carry both source-file identity
and an `implicitMilestone` directive into the semantic pipeline. That arrangement mixed two different
concerns:

- source-file grouping, which belongs to parsing and decode-time concerns in `@sirenpm/language`;
- semantic project modeling, which belongs in `@sirenpm/core`.

In practice, the language decoder already flattened parsed syntax documents into core-facing data. The
document directive was therefore an extra abstraction layer in core rather than a stable semantic concept.

## Decision

`@sirenpm/core` will accept and manipulate only flat `readonly SirenEntry[]` inputs.

Specifically:

- `SirenBuilder` will use `fromEntries(...)` as its primary construction path.
- Document-oriented builder helpers, including `fromDocuments(...)`, `withDocument(...)`, and
  `patchDocument(...)`, are removed.
- Patch bookkeeping is entry-oriented only. `PatchResult` reports entry-level changes rather than
  document-level changes.
- `SirenProject` builds from the raw entry list directly.
- The pipeline seed is `{ rawEntries }`, and the pipeline starts at deduplication.
- Core no longer synthesizes per-document milestones.

Synthetic milestone synthesis is relocated to the `@sirenpm/language` decoder. The decoder interprets document directives at this time, and the milestone synthesizer is wired to this. `directive.implicitMilestone` continues to be `false` by default until the grammar can support it. The language-side synthetic milestone depends on all entries in the file rather than
performing root-detection. That keeps the helper simple and testable without duplicating graph operations while deferring dependency-reduction
or hierarchy recovery to a future module if it becomes necessary.

The core IR vocabulary still retains `Origin`, including `RangeOrigin.document` and `SyntheticOrigin`,
because those types remain useful shared IR terms even after `Document` leaves the core API.

## Consequences

Core's public construction surface is smaller and more direct. Consumers no longer need to manufacture a
document wrapper just to create a semantic project or to apply entry-level mutations.

The semantic pipeline becomes easier to reason about because it operates on a single structural unit from
the start. There is no longer a split between document-shaped inputs and entry-shaped downstream analysis.

Language now owns the file-oriented boundary more explicitly. If a caller wants decode-time synthesis, it is a language concern rather than a core concern.

The removal is an intentional breaking `v0.x` change to `@sirenpm/core`.

## Post-Adoption Note for the Rebuilt Language (ADR-0004)

This ADR was written against the pre-rebuild language architecture (`decodeSyntaxDocuments`,
`renderSirenDocument`, `context-factory.ts`). The ADR-0004 rebuild of `@sirenpm/language`
changes the language-side API surfaces, but the core design decisions — flat `SirenEntry[]`
inputs, `fromEntries` as the sole builder path, synthesis relocated to language — remain
fully valid. The specific mapping is:

| Pre-rebuild surface | Rebuilt surface (ADR-0004) | Notes |
|---|---|---|
| `decodeSyntaxDocuments` → `DecodeResult.documents` | `decodeAstToEntries()` → `readonly SirenEntry[]` | Renamed to match flat-entries contract |
| `renderSirenDocument()` | `renderEntry()` (planned) | Entry-level render, not document-level |
| `context-factory.ts` / `createSirenProjectFromSyntaxDocuments` | `ParsedDocument.toEntries()` | Decoder is a `ParsedDocument` service |
| `SirenBuilder.fromDocuments()` | `SirenBuilder.fromEntries()` | Core changed in v0.6.0 |
| Synthetic milestone via document directives | `synthesizeMilestones` option on `toEntries()` | Default-off, per ADR-0005 contract |

The `siren/entries-over-documents.siren` backlog tasks for the language phase
(`eod-lang-red`, `eod-lang-decoder`, `eod-lang-renderer`, `eod-lang-publish`) targeted the
pre-rebuild surfaces and are superseded by `lang-v060-*` tasks in
`siren/language-ast-pipeline.siren`.

## Alternatives Considered

Keeping `Document` in core as a lightweight grouping wrapper would preserve the old builder surface, but it
would keep a file-oriented concept in the semantic layer without a distinct semantic need.

Keeping core-owned synthesis but moving only the trigger into language would preserve the old topology, but
it would continue to split responsibility between two packages for a behavior that is now better expressed
as decode-time syntax sugar.

Making synthesis permanently dormant instead of wiring it behind a default-off option would reduce surface
area further, but it would also make the implementation path to future grammar support less direct.