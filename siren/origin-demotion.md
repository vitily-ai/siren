# Origin Demotion: Core → Language

**ADR:** [docs/adr/0006-origin-demoted-to-language.md](../docs/adr/0006-origin-demoted-to-language.md)

> **Post-Adoption Note: Rebuilt Language (ADR-0004)**
>
> This plan was written before the ADR-0004 language rebuild replaced `decodeSyntaxDocuments`,
> `cst.ts`, and `context-factory.ts` with the `SirenAst`/`ParsedDocument` architecture.
> The core-phase work (removing `Origin`/`RangeOrigin`/`SyntheticOrigin` from `@sirenpm/core`,
> reducing `DiagnosticBase`) was completed in core v0.6.0 and is **published**.
>
> The language-phase tasks here target the **pre-rebuild** API and are superseded by
> `lang-v060-origin`, `lang-v060-diagnostics`, and `lang-v060-exports` in
> `siren/language-ast-pipeline.siren`. In the rebuild, `Origin` is defined natively at
> `packages/language/src/origin.ts` (no `cst.ts` re-export to replace), diagnostics use
> `DiagnosticBase<'E','L'>`/`<'W','L'>`, and the decoder produces flat `SourcedEntry[]`
> instead of `SirenDocument` with `Resource`.

## What this is

`Origin` (`RangeOrigin`, `SyntheticOrigin`) and all source-attribution machinery are removed from
`@sirenpm/core`. Language owns Origin via structural extension of core's primitive types. Core
carries these extensions opaquely. Integrators such as the CLI discriminate at their end to
retrieve provenance.

This completes the boundary enforcement started in ADR-0005, which removed `Document` from core
but left `Origin` with the rationale that it was a "useful shared IR term." That rationale
was a deferral, not a justification. Origin is parser metadata — it describes where text was
found, not what it means.

## What changes

### Phase 1: `@sirenpm/core`

- `RangeOrigin`, `SyntheticOrigin`, and `Origin` deleted from `packages/core/src/ir/types.ts`
- `SirenEntry.origin` field removed
- `Attribute.origin` field removed
- `source-attribution.ts` deleted (module existed solely to bridge Origin → diagnostic fields)
- `DiagnosticBase` simplified to `{ code: string; severity: 'info' | 'warning' | 'error' }`
  — no `file`, `line`, `column`
- Concrete diagnostic types updated:
  - `CircularDependencyDiagnostic` (W001): carries `nodes` array; no extracted position
  - `DanglingDependencyDiagnostic` (W002): carries `entryId`/`entryType`/`dependencyId`; no position
  - `DuplicateIdDiagnostic` (W003): carries both first-occurrence and duplicate entry references;
    no `firstFile`, `firstLine`, `secondLine`, etc.
- Core tests: `context.test.ts` diagnostic attribution assertions removed; `source-attribution.test.ts`
  deleted with the module

### Phase 2: `@sirenpm/language`

> ⚠️ The pre-rebuild language had a `cst.ts` re-exporting `Origin` from core; the ADR-0004
> rebuild has no `cst.ts` — `Origin` is defined natively at `packages/language/src/origin.ts`.
> The decoder and diagnostics must similarly be updated (see `lang-v060-*` tasks in
> `siren/language-ast-pipeline.siren`).

- Language defines its own `Origin`, `RangeOrigin`, `SyntheticOrigin` types natively
- `SourcedEntry extends SirenEntry { origin: Origin }` added as a language-owned type
- `SourcedAttribute extends Attribute { origin: Origin }` added
- In the pre-rebuild: the re-export of `Origin` from `@sirenpm/core` in
  `packages/language/src/parser/cst.ts` is replaced by the language-native definition.
  In the ADR-0004 rebuild: Origin is defined in `packages/language/src/origin.ts` from the start
  — no re-export to replace.
- Decoder, exporters, and formatters continue to work without changes structurally, but
  the rebuild's decoder must swap `import { Resource, SirenDocument }` for
  `import { SirenEntry, Attribute, Tuple, Atom }` from core and import `Origin` from the
  local `../origin`.
- `@sirenpm/core` dependency pin bumped to `^0.6.0`.

### Phase 3: `@sirenpm/cli`

- `formatDiagnostics` updated to extract source provenance from the entry references carried
  by each diagnostic type, rather than from flat `DiagnosticBase.file/line/column`
- The CLI knows which entries lack origin (those it synthesized itself) and handles them gracefully
- Details scoped at implementation time

## Extension model

TypeScript structural typing is the mechanism. `SourcedEntry[]` satisfies the `SirenEntry[]`
parameter of `SirenBuilder.fromEntries()`. Core's `cloneEntries` (via `klona`) deep-clones all
own enumerable properties including opaque extensions; `deep-freeze-es6` freezes them.
The `origin` property passes through core untouched — preservation of type extensions is an
established invariant verified by existing assembly tests.

## Assumptions

- ~~The parallel CST reimplementation in `@sirenpm/language` is treated as an orthogonal concern~~.
  (This assumption was made when the pre-rebuild language was shipping. The ADR-0004 rebuild
  is now the language package; this plan's language-phase tasks were updated to target the
  rebuild via `siren/language-ast-pipeline.siren`.)
- Entries produced without language (test fixtures, CLI-synthesized entries) are valid without
  an origin. The absence of origin is not an error in the new model.
- Entries vs IDs in diagnostic payloads: the current `entryId` (string) pattern is preferred
  over embedding full entry objects. This keeps diagnostics serializable and avoids snapshot
  coupling. CLI resolves provenance via graph lookup at format time.
