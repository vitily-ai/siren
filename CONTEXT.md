# Siren

Siren defines project plans as version-controlled resources and builds them into an intermediate representation for querying, validation, and tooling.

## Language

**IRContext**:
A recursively frozen built semantic snapshot containing resolved resources and semantic diagnostics.
_Avoid_: Query-only context

**Legacy IRContext Constructor**:
The deprecated but still functional `new IRContext(doc)` construction path.
_Avoid_: Required construction path

**IRAssembly**:
A recursively frozen collection of decoded raw resources that can be built into an **IRContext**.
_Avoid_: ResourceAccumulator, IRBuilder

**Semantic Diagnostic**:
A structured warning or error produced from analysis of decoded Siren resources.
_Avoid_: Parse diagnostic, display message

**Diagnostic File Field**:
The existing optional `file?: string` attribution field on diagnostics.
_Avoid_: Replacement structured spans

**DependencyCycle**:
The nodes-only semantic snapshot cycle shape exposed by **IRContext**.
_Avoid_: Breaking rename of `Cycle`

**Parse Diagnostic**:
A structured warning or error produced while decoding Siren syntax into resources.
_Avoid_: Semantic diagnostic, display message

**Source Attribution**:
The source file and position attached to a resource or diagnostic.
_Avoid_: Display formatting

**Legacy Source Parameter**:
The optional `source?` argument retained for compatibility while source attribution comes from resource origins.
_Avoid_: Fallback diagnostic attribution

**Strictly Additive Refactor**:
A compatibility policy where new public surfaces are introduced without breaking existing consumer APIs, diagnostic shapes, or diagnostic ordering.
_Avoid_: Opportunistic breaking change

**Runtime Immutability Enforcement**:
Recursive freezing of IR snapshots at runtime to enforce the existing readonly API contract.
_Avoid_: Supported mutable IR objects

**Public Export Surface**:
The package-root API exposed by a published Siren package export map.
_Avoid_: Unpublished source-module deep imports

**Resolved Resource**:
A Siren resource after duplicate handling and implicit milestone completion have been applied.
_Avoid_: Raw resource

**Raw Resource**:
A decoded Siren resource before duplicate handling and implicit milestone completion have been applied.
_Avoid_: Resolved resource

## Relationships

- An **IRAssembly** builds exactly one **IRContext** per build operation
- `IRAssembly.build()` is repeatable and non-consuming
- `IRAssembly.build()` eagerly materializes the full **IRContext** semantic snapshot
- An **IRAssembly** contains zero or more **Raw Resources**
- `IRAssembly.fromResources(resources)` accepts resources only and has no `source?` parameter
- `IRAssembly.fromResources(resources)` is the public construction path for **IRAssembly**
- An **IRAssembly** preserves **Raw Resource** order, including duplicates
- An **IRAssembly** exposes its accumulated inputs through `rawResources`
- An **IRAssembly** owns recursively frozen copies of its **Raw Resources**
- **Runtime Immutability Enforcement** freezes **IRAssembly** instances as well as their `rawResources`
- An **IRContext** contains zero or more **Resolved Resources**
- **Resolved Resources** preserve first-occurrence **Raw Resource** order after deduplication and implicit completion
- An **IRContext** contains zero or more **Semantic Diagnostics**
- An **IRContext** contains zero or more **DependencyCycle** values while the existing `Cycle` export remains available for compatibility
- Grouped diagnostic views preserve existing getter names and may add missing groups additively
- The **Legacy IRContext Constructor** remains functional during the **Strictly Additive Refactor** but is deprecated as a construction path
- Deprecated construction paths use `@deprecated` JSDoc markers but do not emit runtime warnings
- Normalization and diagnostic analysis passes are internal implementation details unless a later public API explicitly exposes them
- A **Semantic Diagnostic** describes a problem found while analyzing **Resolved Resources** or accumulated raw resources
- **Semantic Diagnostics** on an **IRContext** are the complete snapshot for that context, not an incremental delta
- `IRContext.diagnostics` preserves current core ordering: cycles, dangling dependencies, then duplicates
- **DependencyCycle** ordering and W001 node sequences preserve current `DirectedGraph.getCycles()` behavior
- W003 emits one **Semantic Diagnostic** for each duplicate **Raw Resource** occurrence after the first
- A **Parse Diagnostic** is returned beside an **IRContext** by language-level parsing APIs
- **Source Attribution** on core **Semantic Diagnostics** comes from each resource origin; missing core attribution leaves `file` undefined
- The **Legacy Source Parameter** remains accepted but does not provide fallback diagnostic attribution
- `IRContext.source` remains readable only as legacy metadata from deprecated construction paths
- The **Diagnostic File Field** remains `file?: string`; richer source fields must be additive if introduced
- The core build operation returns an **IRContext** directly
- A **Strictly Additive Refactor** preserves existing consumer-facing APIs until a planned major migration explicitly changes them
- The first implementation of **IRAssembly** is core-only; language and CLI adoption happens in explicit later milestones
- The **IRAssembly** migration is intended as a minor core release, not a major release, because legacy paths remain functional
- The core minor release blocks language and CLI adoption because those consumers use registry-pinned core packages
- Language adoption uses a compatible core minor range; CLI adoption pins exact released core and language versions
- **Runtime Immutability Enforcement** may reject object mutation because returned IR resources were already out-of-contract to mutate
- **Runtime Immutability Enforcement** freezes built **IRContext** instances as well as their snapshot contents
- Diagnostic type moves preserve the **Public Export Surface**; unpublished source-module deep imports are not compatibility commitments
- IR snapshots preserve resource value, order, ID, diagnostics, and attribution; caller object identity is out of contract
- Existing deprecated-construction tests guard compatibility; new **IRAssembly** tests focus on the new assembly contract

## Example dialogue

> **Dev:** "Should W001 warnings live outside the context so callers compare diagnostic deltas?"
> **Domain expert:** "No — an **IRContext** is the built semantic snapshot, so its **Semantic Diagnostics** are already colocated with the resources they describe."

## Flagged ambiguities

- "context" was used to mean both a query-only resource view and a built semantic snapshot — resolved: **IRContext** means the built semantic snapshot.
- "build result" was used to mean a separate core wrapper around context and diagnostics — resolved: core build returns **IRContext** directly.
- "assembly" was considered alongside "resource accumulator" — resolved: **IRAssembly** is the public term.
- "diagnostics" was used to mean both parse and semantic problems — resolved: primary APIs keep **Parse Diagnostics** separate from **Semantic Diagnostics**.
- "resources" was used to mean both decoded inputs and built outputs — resolved: **Raw Resources** live in **IRAssembly**, while **Resolved Resources** live in **IRContext**.
- "IRAssembly resources getter" was ambiguous — resolved: the getter is `rawResources` to distinguish it from `IRContext.resources`.
- "snapshot timing" was ambiguous because `IRContext` used lazy caches — resolved: `IRAssembly.build()` eagerly computes the full semantic snapshot.
- `IRContext.fromResources(resources, source?)` and `IRContext.source` remain only as deprecated compatibility; **IRAssembly** expects resources to declare their own **Source Attribution**.
- "refactor" was ambiguous about compatibility scope — resolved: the diagnostic pipeline decoupling work is a **Strictly Additive Refactor**.
- "recursive freeze" was ambiguous about whether mutating returned resources is supported — resolved: mutation is out of contract, so **Runtime Immutability Enforcement** is compatible with the existing readonly API.
- "public import path" was ambiguous for moved diagnostic variant types — resolved: the compatibility boundary is the package root **Public Export Surface**.
- "source parameter" was ambiguous about fallback file attribution — resolved: the **Legacy Source Parameter** stays accepted for compatibility but resource origins remain the only diagnostic attribution source.
- "source address helper" was ambiguous about changing diagnostic attribution shape — resolved: preserve the **Diagnostic File Field** shape and only add richer fields additively.
- "constructor deprecation" was deferred in the original plan — resolved: the **Legacy IRContext Constructor** is deprecated now while remaining functional until a future major migration.
- "adoption scope" was ambiguous about downstream churn — resolved: first implementation is core-only, with language and CLI adoption deferred to explicit later milestones.
- "cycle type rename" was ambiguous — resolved: introduce **DependencyCycle** additively and preserve the existing `Cycle` export.
- "grouped diagnostics" was ambiguous about renaming getters — resolved: preserve existing getter names and add missing grouped views only additively.
- "resource identity" was ambiguous after cloning was introduced — resolved: snapshots use value semantics, so returned resources need not be the same object references as caller inputs.
- "missing source attribution" conflicted with core tests — resolved: core **Semantic Diagnostics** omit `file` when no resource origin exists rather than synthesizing `unknown`.
- "IRAssembly inputs" was ambiguous about legacy source metadata — resolved: `IRAssembly.fromResources(resources)` accepts resources only and does not take `source?`.
- "IRAssembly constructor" was ambiguous — resolved: `IRAssembly.fromResources(resources)` is the public construction path rather than a direct constructor.
- "analysis pass visibility" was ambiguous — resolved: extracted normalization and diagnostic passes remain internal in this refactor.
- "diagnostic ordering" briefly considered severity/code sorting — resolved: core preserves current ordering, while display-layer sorting is future UX work.
- "compatibility tests" were ambiguous about comparing old and new construction paths — resolved: keep the existing deprecated-construction test bed and add focused **IRAssembly** tests without redundant equivalence comparisons.
- "release type" was ambiguous after deprecations were introduced — resolved: the additive **IRAssembly** migration is minor-version work; removals wait for a future major migration.
