# Siren

Siren defines project plans as version-controlled resources and builds them into an immutable semantic snapshot for querying, validation, and tooling.

## Core Model

**SirenBuilder**:
Public construction class for `@sirenpm/core`. `SirenBuilder.fromResources(resources)` clones and freezes raw resources, preserves caller order, and `build()` returns a `SirenProject`.
_Avoid_: direct `SirenProject` construction, mutable assembly

**SirenProject**:
Immutable built semantic snapshot with resolved resources, cached graph/query helpers, and semantic diagnostics.
_Avoid_: query-only view, incremental result

**Document**:
Top-level resource container exported from core for compatibility and source attribution metadata.
_Avoid_: public build input wrapper

**Resource**:
Decoded task or milestone with `type`, `id`, optional `status`, `attributes`, and optional `origin`.
_Avoid_: raw syntax node

**Attribute**:
A key-value pair within a resource. The `value` field is always a `Tuple`, even for scalar values. Optional `origin` metadata supports comment-aware formatting.
_Avoid_: null values, Attribute.raw (removed field)

**Atom**:
A single atomic value that can appear in a `Tuple`: `string | number | boolean | ResourceReference`. The `null` value is not an atom; absence is represented by the empty tuple.
_Avoid_: PrimitiveValue (superseded type)

**Tuple**:
An ordered, readonly sequence of atoms (`readonly Atom[]`). Scalar attributes are encoded as single-element tuples; list-valued attributes are multi-element tuples; absence is the empty tuple `[]`. The `isReference` guard discriminates atoms, not tuples. The `isArray` and `isPrimitive` guards have been removed.
_Avoid_: AttributeValue (superseded), ArrayValue (superseded), null for absence

**Origin**:
Base provenance marker attached to resources and attributes. Shape `{ kind: string; address: string }`. `kind` is an open discriminator; `address` is the canonical logical address of the host. Concrete origin kinds extend this base.
_Avoid_: display formatting, source coordinates on the base

**SyntheticOrigin**:
Core-owned `Origin` with `kind: 'synthetic'`, marking resources produced by milestone synthesis. Carries no source coordinates.
_Avoid_: range origin, hand-authored resources

**RangeOrigin**:
Language-owned `Origin` with `kind: 'range'`, adding `startByte`, `endByte`, `startRow`, `endRow`. Attached by the language decoder to resources/attributes that come from parsed source. Core never narrows to this type.
_Avoid_: core-side coordinate type

**Diagnostic Address**:
Required string field on every diagnostic, canonical format `<documentId>[:<resourceId>[:<attributeKey>]]`. Logical, stable, layer-agnostic. The diagnostic's *primary target*; related locations live in the diagnostic's `context`. The colon `:` is reserved and must not appear in document or resource ids — violations emit `E001` at the core boundary.
_Avoid_: file path, line/column, structured object on the base

**Diagnostic Context (trivia slot)**:
Generic `TContext` on `DiagnosticBase<TContext>`. Each concrete diagnostic binds it to a typed shape carrying variant-specific data (cycle nodes, dangling target id, precedent address, etc.). Replaces the previous pattern of bolting ad-hoc top-level fields onto the base.
_Avoid_: untyped bag, top-level variant fields on the base

**DiagnosticBase**:
Shared shape `{ code, severity, address, context: TContext }` for every diagnostic, semantic or parse. No `message`, no `file`, no `line`, no `column`. Generic in `TContext`.
_Avoid_: formatted text message, source coordinates on the base

**Semantic Diagnostic**:
Structured warning or error produced by IR analysis of a built `SirenProject`. Address depth varies (`<doc>:<resource>` for W001/W003, `<doc>:<resource>:<attribute>` for W002).
_Avoid_: parse diagnostic, incremental delta

**ParseDiagnostic**:
Language-owned diagnostic produced during parse/decode. Extends `DiagnosticBase<TContext>` with `message: string` and an inline `origin: RangeOrigin` carrying coordinates directly, because no resource exists yet to hydrate from. Address is at least `<documentId>` and may include resource scope when known.
_Avoid_: semantic diagnostic, address-only diagnostic

**CircularDependencyDiagnostic / DanglingDependencyDiagnostic / DuplicateIdDiagnostic**:
Core W001/W002/W003 diagnostics exposed from `SirenProject.diagnostics`. W001 addresses the first cycle node and carries `{ nodes }` in context. W002 addresses the holding attribute (`<doc>:<res>:depends_on`) and carries `{ resourceId, resourceType, dependencyId }`. W003 addresses the duplicate (second) declaration and carries `{ resourceId, resourceType, precedentAddress }`.
_Avoid_: ad hoc error strings, top-level position fields

**Diagnostic Hydrator**:
Language-package utility that maps a logical `address` to `{ file, line?, column? }` by looking up the host resource/attribute on a `SirenProject` and reading its `RangeOrigin`. Owned by `@sirenpm/language` because coordinate concerns belong to the parsing layer. Returns coordinates only when the host has a `RangeOrigin`; `SyntheticOrigin` hosts hydrate to a file/document with no row.
_Avoid_: core-side hydration, line-without-file output

**IRExporter**:
Interface for turning a built `SirenProject` back into Siren text.
_Avoid_: parser or decoder API

**Public Export Surface**:
The package-root API exposed by `@sirenpm/core`: public IR types, `SirenBuilder`, `SirenProject`, diagnostics, `IRExporter`, type guards, utilities, and `version`.
_Avoid_: undocumented deep imports

## Relationships

- `SirenBuilder.fromResources(resources)` accepts raw `Resource`s only and has no `source?` parameter.
- `SirenBuilder.resources` returns frozen raw resources in caller order, including duplicates.
- `SirenBuilder.build()` is repeatable and non-consuming.
- `SirenProject.resources` returns deduplicated resources with implicit milestone completion applied.
- `SirenProject.graph` is cached so query helpers reuse the same dependency graph instance.
- `SirenProject.diagnostics` is the complete semantic snapshot and preserves the current ordering: cycles, dangling dependencies, then duplicates.
- W001 diagnostics expose dependency cycles; there is no separate public cycles API.
- Resource file attribution comes from the document segment of the resource's `origin.address`; missing origin leaves attribution undefined.
- Diagnostic file/line/column attribution is **derived** by hydrating `diagnostic.address` through the language-owned hydrator; core diagnostics carry no coordinates.
- `SirenProject` is frozen and is only constructed internally by `SirenBuilder.build()`.
- The package-root export surface intentionally keeps the public snapshot and helper types together so consumers do not need deep imports.
- `SirenProject` provides `findResourceById()`, `getMilestoneIds()`, `getTasksByMilestone()`, `getDependencyTree()`, and `diagnostics` for consumers.

## Language Model

**Parsed Document Model**:
A source-preserving representation of one parsed Siren source document between the grammar-shaped CST and semantic IR.
_Avoid_: AST, parsed AST, lossless syntax tree

**Concrete Syntax Tree**:
The grammar-shaped parse output that mirrors Tree-sitter nodes before Siren-specific source facts are normalized.
_Avoid_: AST, semantic tree

**Semantic IR**:
The meaning-focused project representation used for resources, dependencies, validation, and utilities.
_Avoid_: syntax tree, parsed document

**Syntax Trivia**:
Source-preserving non-semantic material attached to the Parsed Document Model, such as comments and blank-line separation.
_Avoid_: semantic metadata, IR comments

**Source Span**:
The source-document identity and byte/row range occupied by a parsed Siren construct.
_Avoid_: diagnostic location, semantic origin

## Relationships

- A Concrete Syntax Tree is decoded into one Parsed Document Model per source document.
- One or more Parsed Document Models are semantically decoded into Semantic IR.
- Parsed Document Models preserve source facts that Semantic IR intentionally excludes.
- Syntax Trivia belongs to the Parsed Document Model, not to Semantic IR.
- Each syntax node and Syntax Trivia item has a Source Span.

## Example dialogue

> **Dev:** "Should cycle warnings live outside the project so callers compare diagnostic deltas?"
> **Domain expert:** "No — a `SirenProject` is the built semantic snapshot, so its diagnostics and resources are already colocated."

## Flagged ambiguities

- "context" was used to mean both a query-only view and a built snapshot — resolved: `SirenProject` is the built snapshot.
- "builder input" was used to mean a document wrapper — resolved: `SirenBuilder.fromResources(resources)` accepts raw resources directly.
- "source" attribution was used to mean a separate constructor argument — resolved: resource origins provide attribution.
- "document" is overloaded between the core compatibility type and language parsing concepts — resolved: use the package-specific type names in the corresponding layer.
- "diagnostic position" was used to mean both source coordinates (file/line/column) and logical targets — resolved: diagnostics carry a logical **Diagnostic Address**; coordinates are derived by the **Diagnostic Hydrator** in the language package.
- "origin document" was used as a field on `Origin` and as a separator-free identifier — resolved: the document is the first segment of `Origin.address`; the standalone field is removed.

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
