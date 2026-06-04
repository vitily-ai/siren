---
status: accepted
supersedes: adr-0005 (partial — retracts the decision to retain Origin in core)
---

# Origin Demoted from Core to Language

`Origin` (including `RangeOrigin`, `SyntheticOrigin`, and their presence on `SirenEntry.origin` and
`Attribute.origin`) is removed from `@sirenpm/core` and owned instead by `@sirenpm/language`.
Source provenance — byte offsets, row/column positions, document identity — is not semantic data.
Core carries language-defined extensions opaquely; integrators such as the CLI discriminate on the
other end to retrieve `Origin` and hydrate diagnostics with source provenance.

## Context

ADR-0005 removed `Document` from core but expressly retained `Origin`:

> *The core IR vocabulary still retains `Origin`, including `RangeOrigin.document` and
> `SyntheticOrigin`, because those types remain useful shared IR terms even after `Document`
> leaves the core API.*

The same reasoning that drove `Document` out of core applies to `Origin`. Source positions are
parser-level metadata — they describe where text was found, not what it means. Retaining `Origin`
in core created an awkward coupling:

- **`source-attribution.ts`** in core existed solely to extract file/line/column from `Origin`
  and spread those values onto diagnostic objects. The module had no semantic purpose — it was
  a formatting bridge living in the wrong layer.
- **`DiagnosticBase`** carried `file`, `line`, and `column` fields that were always derived from
  `Origin` but were type-stamped at diagnostic-construction time in core, forcing core to
  understand a parse-only concept.
- **Every diagnostic producer** in core (`diagnoseCycles`, `diagnoseDanglingDependencies`,
  `diagnoseDuplicateEntries`) had to import source-attribution helpers and scatter position
  data onto diagnostics. This tangled semantic analysis with positional bookkeeping.

## Decision

`Origin` and all source-attribution machinery are removed from `@sirenpm/core`. The language
package (or any integrator that creates entries from source text) declares its own extended
types that add origin as an opaque property.

### Type changes in `@sirenpm/core`

- `RangeOrigin`, `SyntheticOrigin`, and `Origin` are deleted from `packages/core/src/ir/types.ts`.
- `SirenEntry.origin` is removed. Core's `SirenEntry` has no provenance field.
- `Attribute.origin` is removed. Same rationale.
- `Document` (already unexported) is cleaned up if it still references origin-like fields.
- `source-attribution.ts` and all its exports are deleted.
- `DiagnosticBase` is reduced to:
  ```typescript
  export interface DiagnosticBase {
    readonly code: string;
    readonly severity: 'info' | 'warning' | 'error';
  }
  ```
  No `file`, `line`, `column`.

### Concrete diagnostic changes

Each diagnostic type carries references to the entries under diagnosis instead of pre-extracted
position fields. The shape is decided per type — entry objects or entry IDs are both viable; the
key invariant is that provenance is resolved by the consumer, not by core.

- **W001 (CircularDependencyDiagnostic)**: Carries `nodes` (the cycle) and a reference to the
  cycle-start entry. No `file`/`line` derived from origin.
- **W002 (DanglingDependencyDiagnostic)**: Carries the dangling `entry` (or `entryId`) and
  `dependencyId`. No extracted position.
- **W003 (DuplicateIdDiagnostic)**: Carries references to both the first-occurrence and
  duplicate entries. Ordering (first vs second) is determined by array position — core does not
  need origin for that. No `firstFile`/`firstLine`/`secondLine` etc.

### How language owns origin

The language package defines its own extension of core's primitive types:

```typescript
// In @sirenpm/language, not in core
import type { Origin } from './origin'; // language-owned

export interface SourcedEntry extends SirenEntry {
  origin: Origin;
}

export interface SourcedAttribute extends Attribute {
  origin: Origin;
}
```

Core's `SirenBuilder.fromEntries()` accepts `SirenEntry[]`. Because TypeScript uses structural
typing, `SourcedEntry[]` satisfies this signature. Core's `cloneEntries` (via `klona`) deep-clones
all own enumerable properties including unknown ones, and `deep-freeze-es6` freezes them. The
extra `origin` property passes through core untouched — preservation of type extensions is an
established invariant.

### Integrator discrimination

Integrators (CLI, web app, editor) receive `SirenEntry[]` from `SirenProject.entries`. When a
consumer needs source provenance, it narrows or casts to the language-provided extended type.
Entries that lack origin (programmatically synthesized entries, CLI-generated entries, test
fixtures) are valid — they simply have no provenance to report.

Diagnostic formatting becomes a consumer responsibility:
- The CLI receives diagnostics carrying entry references.
- It resolves each entry's origin by retrieving the entry from its available context (project
  snapshot, graph, or direct reference).
- It extracts `origin.document`, `origin.startRow`, etc. and formats `file:line:col:` prefixes.

### Implementation order

1. **Core publishes first.** Remove `Origin` types, `source-attribution.ts`, and position fields
   from diagnostics. Release as a breaking `v0.x` change.
2. **Language follows.** Update the dependency on `@sirenpm/core` to the new version and
   simultaneously introduce its own `Origin` type, `SourcedEntry`, `SourcedAttribute`, and any
   migration helpers.
3. **CLI follows last.** Update `formatDiagnostics` to retrieve origin from entry references
   carried by diagnostics. Details are deferred until CLI changes are scoped.

## Consequences

### Positive

- **Core is cleaner.** No positional bookkeeping, no source-attribution bridge module, no
  `DiagnosticBase` fields that only make sense in a file-oriented context. Semantic analysis
  stays purely semantic.
- **Attribution is more flexible.** Different integrators can define different provenance models.
  A web frontend might attach URL+line; a language server might use URI ranges; a CLI uses
  `file:line:col`. Core doesn't constrain any of them.
- **Diagnostic types carry richer context.** Carrying the entry under diagnosis (rather than
  extracted scalars) enables integrators to do more than just format positions — they can render
  entry excerpts, link to definitions, or group diagnostics by source file.
- **Origin becomes a proper language abstraction.** It lives in the package that creates it,
  alongside the CST nodes and decoder that produce it. The re-export from `packages/language/src/parser/cst.ts`
  becomes a native definition.

### Negative

- **Breaking change to `@sirenpm/core`.** Consumers that import `Origin`, `RangeOrigin`, or
  `SyntheticOrigin` from core will break. The `SirenEntry` and `Attribute` interfaces lose
  their `origin` field.
- **Consumers that read diagnostic positions** must migrate to the entry-reference pattern.
  The `formatDiagnostics` function in the CLI and any other formatter needs rewriting.
- **Slightly more ceremony for integrators.** Extracting provenance is no longer a property
  access on the diagnostic — it requires discriminating the diagnostic's payload, retrieving
  the entry, and extracting origin from it.
- **CST types** that currently re-export `Origin` from core (in `packages/language/src/parser/cst.ts`)
  will have a brief window where the re-export points at a now-missing export.
  This is resolved by the language owning its own type in the same release cycle.

### Migration

- Core tests that constructed entries with `origin` fields (e.g., `context.test.ts` diagnostic
  assertions) are simplified to omit origin entirely. Position assertions on diagnostics are
  removed — those belong in language-side or CLI-side tests.
- The `source-attribution.test.ts` file is deleted alongside `source-attribution.ts`.
- Pipeline module tests that only check diagnostic codes (not positions) are unaffected.

## Alternatives Considered

### Keep Origin in core (status quo ante)

The previous arrangement, codified by ADR-0005. Origin stays in core as a "useful shared IR term."
This was rejected because Origin is not semantically useful — it is parser metadata. Keeping it
in core perpetuates the coupling that ADR-0005 resolved for Document.

### Generic parameter on SirenEntry

Instead of opaque structural extension, make `SirenEntry<TOrigin>` generic. This would provide
type safety for the extension but leak generic plumbing throughout core's type signatures,
`EntryGraph`, `SirenBuilder`, and every pipeline module. The complexity cost outweighs the
benefit when structural typing already works and core never inspects the extension.

### Metadata bag on entries

Attach a single `metadata?: Record<string, unknown>` field to `SirenEntry` and let packages
key into it. This is more structured than opaque structural extension but introduces an
unnecessary indirection and accepts arbitrary keys with no type safety. The language-owned
extension pattern (subtype with a typed field) is simpler and preserves type checking within
language's boundaries.

## ADR-0005 Amendment

This ADR supersedes the paragraph in ADR-0005 that reads:

> *The core IR vocabulary still retains `Origin`, including `RangeOrigin.document` and
> `SyntheticOrigin`, because those types remain useful shared IR terms even after `Document`
> leaves the core API.*

Origin is not a useful shared IR term — it is parser metadata. ADR-0005 correctly removed
`Document` from core; this ADR completes the same boundary enforcement for `Origin`.
