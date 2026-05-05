# Siren

Siren defines project plans as version-controlled resources and builds them into an intermediate representation for querying, validation, and tooling.

## Language

**IRContext**:
A non-publicly constructible class representing a recursively frozen built semantic snapshot with resolved resources, semantic diagnostics, and query methods.
_Avoid_: Query-only context, public construction path

**Legacy IRContext Constructor**:
The former `new IRContext(doc)` construction path removed from the core API by the breaking 0.x refactor.
_Avoid_: Deprecated compatibility path

**IRAssembly**:
A recursively frozen collection of decoded raw resources that can be built into an **IRContext**.
_Avoid_: ResourceAccumulator, IRBuilder

**Semantic Diagnostic**:
A structured warning or error produced from analysis of decoded Siren resources.
_Avoid_: Parse diagnostic, display message

**Diagnostic File Field**:
The existing optional `file?: string` attribution field on diagnostics.
_Avoid_: Replacement structured spans

**Cycle Diagnostic**:
A W001 **Semantic Diagnostic** whose `nodes` field identifies the dependency cycle.
_Avoid_: Separate public cycle snapshot API

**Parse Diagnostic**:
A structured warning or error produced while decoding Siren syntax into resources.
_Avoid_: Semantic diagnostic, display message

**Source Attribution**:
The source file and position attached to a resource or diagnostic.
_Avoid_: Display formatting

**Legacy Source Parameter**:
The former optional `source?` argument removed from core construction APIs; source attribution comes from resource origins.
_Avoid_: Fallback diagnostic attribution, deprecated compatibility path

**Breaking 0.x Core Refactor**:
A compatibility policy for the core prerequisite milestone where vestigial construction signatures are removed instead of retained as deprecated because Siren is still in semver 0.x.
_Avoid_: Strictly Additive Refactor, deprecated compatibility path

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
- `IRAssembly.build()` is the only public construction path for an **IRContext**
- An **IRAssembly** contains zero or more **Raw Resources**
- `IRAssembly.fromResources(resources)` accepts resources only and has no `source?` parameter
- `IRAssembly.fromResources(resources)` is the public construction path for **IRAssembly**
- Core construction APIs accept **Raw Resources** directly and do not expose a top-level document input type
- An **IRAssembly** preserves **Raw Resource** order, including duplicates
- An **IRAssembly** exposes its accumulated raw inputs through `resources`
- `IRAssembly.resources` means frozen **Raw Resources**; `IRContext.resources` means frozen **Resolved Resources**
- An **IRAssembly** owns recursively frozen copies of its **Raw Resources**
- **Runtime Immutability Enforcement** freezes **IRAssembly** instances as well as their `resources`
- An **IRContext** contains zero or more **Resolved Resources**
- An **IRContext** remains a class so query-oriented consumers can use class semantics without owning construction
- **Resolved Resources** preserve first-occurrence **Raw Resource** order after deduplication and implicit completion
- An **IRContext** contains zero or more **Semantic Diagnostics**
- Dependency cycles are exposed through W001 **Cycle Diagnostics**, not through a separate `IRContext.cycles` API
- `IRContext.diagnostics` is the only public semantic diagnostic snapshot view
- The **Legacy IRContext Constructor** is removed from the core API during the **Breaking 0.x Core Refactor**
- Normalization and diagnostic analysis passes are internal implementation details unless a later public API explicitly exposes them
- A **Semantic Diagnostic** describes a problem found while analyzing **Resolved Resources** or accumulated raw resources
- **Semantic Diagnostics** on an **IRContext** are the complete snapshot for that context, not an incremental delta
- `IRContext.diagnostics` preserves current core ordering: cycles, dangling dependencies, then duplicates
- W001, W002, and W003 diagnostic structures remain stable unless preserving them would complicate the core snapshot model
- W001 node sequences preserve current `DirectedGraph.getCycles()` behavior
- W003 emits one **Semantic Diagnostic** for each duplicate **Raw Resource** occurrence after the first
- A **Parse Diagnostic** is returned beside an **IRContext** by language-level parsing APIs
- **Source Attribution** on core **Semantic Diagnostics** comes from each resource origin; missing core attribution leaves `file` undefined
- `Resource.origin.document` supersedes document-level source metadata for core attribution
- The **Legacy Source Parameter** is removed from core construction APIs rather than accepted as inert metadata
- `IRContext.source` is not part of the built semantic snapshot API after the **Breaking 0.x Core Refactor**
- The **Diagnostic File Field** remains `file?: string`; richer source fields must be additive if introduced
- The core build operation returns an **IRContext** directly
- A **Breaking 0.x Core Refactor** may break core consumer-facing APIs to remove vestigial signatures while preserving intentional semantic behavior
- The first implementation of **IRAssembly** is a core-only prerequisite; language and CLI adoption happens in explicit later milestones
- The **IRAssembly** migration removes legacy core construction paths rather than carrying them as deprecated compatibility surfaces
- The core 0.x prerequisite release blocks language and CLI adoption because those consumers use registry-pinned core packages
- Language adoption updates its compatible core range for the released 0.x line; CLI adoption pins exact released core and language versions
- **Runtime Immutability Enforcement** may reject object mutation because returned IR resources were already out-of-contract to mutate
- **Runtime Immutability Enforcement** freezes built **IRContext** instances as well as their snapshot contents
- The **Public Export Surface** intentionally drops vestigial core exports during the **Breaking 0.x Core Refactor**
- IR snapshots preserve resource value, order, ID, diagnostics, and attribution; caller object identity is out of contract
- Existing deprecated-construction tests are replaced by **IRAssembly** and snapshot tests that guard the new core contract

## Example dialogue

> **Dev:** "Should W001 warnings live outside the context so callers compare diagnostic deltas?"
> **Domain expert:** "No — an **IRContext** is the built semantic snapshot, so its **Semantic Diagnostics** are already colocated with the resources they describe."

## Flagged ambiguities

- "context" was used to mean both a query-only resource view and a built semantic snapshot — resolved: **IRContext** means the built semantic snapshot.
- "IRContext shape" was ambiguous after removing legacy construction — resolved: **IRContext** remains a class, but **IRAssembly** owns public construction.
- "build result" was used to mean a separate core wrapper around context and diagnostics — resolved: core build returns **IRContext** directly.
- "assembly" was considered alongside "resource accumulator" — resolved: **IRAssembly** is the public term.
- "diagnostics" was used to mean both parse and semantic problems — resolved: primary APIs keep **Parse Diagnostics** separate from **Semantic Diagnostics**.
- "resources" was used to mean both decoded inputs and built outputs — resolved: **Raw Resources** live in **IRAssembly**, while **Resolved Resources** live in **IRContext**.
- "document" was ambiguous as a core input wrapper versus a language parse concept — resolved: core consumes **Raw Resources** directly; language owns parse/decode document wrappers.
- "IRAssembly resources getter" was ambiguous — resolved: the getter is `resources`; the owner distinguishes raw assembly inputs from resolved context outputs.
- "snapshot timing" was ambiguous because `IRContext` used lazy caches — resolved: `IRAssembly.build()` eagerly computes the full semantic snapshot.
- `IRContext.fromResources(resources, source?)` and `IRContext.source` are legacy core construction surfaces to remove; **IRAssembly** expects resources to declare their own **Source Attribution**.
- "refactor" was ambiguous about compatibility scope — resolved: the core prerequisite is a **Breaking 0.x Core Refactor**, while language and CLI adoption remain follow-up entries.
- "recursive freeze" was ambiguous about whether mutating returned resources is supported — resolved: mutation is out of contract, so **Runtime Immutability Enforcement** is compatible with the existing readonly API.
- "public import path" was ambiguous for moved diagnostic variant types — resolved: the package root **Public Export Surface** is the only supported import boundary, and vestigial core exports may be removed there during the breaking refactor.
- "source parameter" was ambiguous about fallback file attribution — resolved: the **Legacy Source Parameter** is removed from core construction APIs and resource origins remain the only diagnostic attribution source.
- "source address helper" was ambiguous about changing diagnostic attribution shape — resolved: preserve the **Diagnostic File Field** shape and only add richer fields additively.
- "constructor deprecation" was deferred in the original plan — resolved: the **Legacy IRContext Constructor** is removed as part of the **Breaking 0.x Core Refactor** rather than retained as deprecated.
- "adoption scope" was ambiguous about downstream churn — resolved: first implementation is core-only, with language and CLI adoption deferred to explicit later milestones.
- "cycle type rename" was ambiguous — resolved: there is no public cycle snapshot type; cycle information is exposed through W001 **Cycle Diagnostics**.
- "grouped diagnostics" was ambiguous about public getters — resolved: grouped diagnostic arrays are internal only; **IRContext** exposes the aggregate `diagnostics` snapshot.
- "resource identity" was ambiguous after cloning was introduced — resolved: snapshots use value semantics, so returned resources need not be the same object references as caller inputs.
- "missing source attribution" conflicted with core tests — resolved: core **Semantic Diagnostics** omit `file` when no resource origin exists rather than synthesizing `unknown`.
- "IRAssembly inputs" was ambiguous about legacy source metadata — resolved: `IRAssembly.fromResources(resources)` accepts resources only and does not take `source?`.
- "IRAssembly constructor" was ambiguous — resolved: `IRAssembly.fromResources(resources)` is the public construction path rather than a direct constructor.
- "analysis pass visibility" was ambiguous — resolved: extracted normalization and diagnostic passes remain internal in this refactor.
- "diagnostic ordering" briefly considered severity/code sorting — resolved: core preserves current ordering, while display-layer sorting is future UX work.
- "diagnostic stability" was ambiguous under the breaking cleanup — resolved: preserve W001, W002, and W003 structures and ordering because doing so does not complicate the core refactor.
- "compatibility tests" were ambiguous about comparing old and new construction paths — resolved: remove deprecated-construction expectations and keep focused **IRAssembly** plus snapshot tests for the new core contract.
- "release type" was ambiguous after deprecations were introduced — resolved: Siren's semver 0.x status allows the core prerequisite to remove vestigial signatures now, with language and CLI adoption tracked as follow-up work.

---

# Siren Language Model

This context defines the project language for Siren source files, parsed documents, and semantic project-management data. It exists so parser, formatter, CLI, and future editor work use the same terms for the same concepts.

## Language

**Parsed Document Model**:
A source-preserving representation of one parsed Siren source document between the grammar-shaped CST and semantic IR.
_Avoid_: Lossless syntax tree, AST, parsed AST

**Concrete Syntax Tree**:
The grammar-shaped parse output that mirrors Tree-sitter nodes before Siren-specific source facts are normalized.
_Avoid_: AST, semantic tree

**Semantic IR**:
The meaning-focused project representation used for resources, dependencies, validation, and utilities.
_Avoid_: Syntax tree, parsed document

**Syntax Trivia**:
Source-preserving non-semantic material attached to the Parsed Document Model, such as comments and blank-line separation.
_Avoid_: Semantic metadata, IR comments

**Source Span**:
The source-document identity and byte/row range occupied by a parsed Siren construct.
_Avoid_: Diagnostic location, semantic origin

## Relationships

- A **Concrete Syntax Tree** is decoded into one **Parsed Document Model** per source document in a parse result.
- One or more **Parsed Document Models** are semantically decoded into **Semantic IR**.
- A **Parsed Document Model** preserves source facts that **Semantic IR** intentionally excludes.
- **Syntax Trivia** belongs to the **Parsed Document Model**, not to **Semantic IR**.
- Each syntax node and **Syntax Trivia** item has a **Source Span**.

## Example Dialogue

> **Dev:** "Should comments be stored on the Semantic IR so formatting can use them?"
> **Domain expert:** "No — comments are source facts, so they belong to the Parsed Document Model. Semantic IR should only answer what the Siren project means."

## Flagged Ambiguities

- "lossless syntax tree" and "parsed document model" were both used for the same new layer — resolved: use **Parsed Document Model** as the domain term, with implementation type names chosen separately.
