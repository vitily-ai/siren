# Siren

Siren defines project plans as version-controlled entries and builds them into an immutable semantic snapshot for querying, validation, and tooling.

## Core Model and Terminology

**SirenBuilder**:
Public construction class for `@sirenpm/core`. `SirenBuilder.fromEntries(entries)` clones and freezes raw entries, preserves caller order, and `build()` returns a `SirenProject`.
_Avoid_: direct `SirenProject` construction, mutable assembly

**SirenProject**:
Immutable built semantic snapshot with resolved entries, cached graph/query helpers, and semantic diagnostics.
_Avoid_: query-only view, incremental result

**Document**:
Top-level resource container exported from core for compatibility and source attribution metadata.
_Avoid_: public build input wrapper

**Entry - `SirenEntry` - Formerly "Resource"**:
Decoded task or milestone with `type`, `id`, optional `status`, `attributes`, and optional `origin`.
_Avoid_: raw syntax node

**Resource**:
Catch-all conventional term referring to any value or structure represented in a project, including Documents, Entries, Attributes, etc.
_Avoid_: Introducing this term into code

**Attribute**:
A key-value pair within an entry. The `value` field is always a `Tuple`, even for scalar values. Optional `origin` metadata supports comment-aware formatting.
_Avoid_: null values, Attribute.raw (removed field)

**Atom**:
A single atomic value that can appear in a `Tuple`: `string | number | boolean | EntryReference`. The `null` value is not an atom; absence is represented by the empty tuple.
_Avoid_: PrimitiveValue (superseded type)

**Tuple**:
An ordered, readonly sequence of atoms (`readonly Atom[]`). Scalar attributes are encoded as single-element tuples; list-valued attributes are multi-element tuples; absence is the empty tuple `[]`. The `isReference` guard discriminates atoms, not tuples. The `isArray` and `isPrimitive` guards have been removed.
_Avoid_: AttributeValue (superseded), ArrayValue (superseded), null for absence

**Origin**:
Source attribution metadata attached to entries and attributes. Carries byte/row offsets plus optional `document`.
_Avoid_: display formatting

**DiagnosticBase**:
Shared diagnostic shape `{ code, severity, file?, line?, column? }` with no `message`.
_Avoid_: formatted text message

**Semantic Diagnostic**:
Structured warning or error produced by IR analysis of a built `SirenProject`.
_Avoid_: parse diagnostic, incremental delta

**CircularDependencyDiagnostic / DanglingDependencyDiagnostic / DuplicateIdDiagnostic**:
Core W001/W002/W003 diagnostics exposed from `SirenProject.diagnostics`.
_Avoid_: ad hoc error strings

**IRExporter**:
Interface for turning a built `SirenProject` back into Siren text.
_Avoid_: parser or decoder API

**Public Export Surface**:
The package-root API exposed by `@sirenpm/core`: public IR types, `SirenBuilder`, `SirenProject`, diagnostics, `IRExporter`, type guards, utilities, and `version`.
_Avoid_: undocumented deep imports

## Relationships

- `SirenBuilder.fromEntries(entries)` accepts raw `SirenEntry` array.
- `SirenBuilder.entries` returns frozen raw entries in caller order, including duplicates.
- `SirenBuilder.build()` is repeatable and non-consuming.
- `SirenProject.entries` returns deduplicated entries with implicit milestone completion applied.
- `SirenProject.graph` is cached so query helpers reuse the same dependency graph instance.
- `SirenProject.diagnostics` is the complete semantic snapshot and preserves the current ordering: cycles, dangling dependencies, then duplicates.
- W001 diagnostics expose dependency cycles; there is no separate public cycles API.
- Entry and diagnostic file attribution come from `origin.document`; missing attribution leaves `file` undefined.
- `SirenProject` is frozen and is only constructed internally by `SirenBuilder.build()`.
- The package-root export surface intentionally keeps the public snapshot and helper types together so consumers do not need deep imports.
- `SirenProject` provides `findEntryById()`, `getMilestoneIds()`, `getTasksByMilestone()`, `getDependencyTree()`, and `diagnostics` for consumers.

## Language Model

**Concrete Syntax Tree**:
The internal Tree-sitter parse tree for Siren source. It is the source-authoritative structure for formatting, comments, raw spelling, and source locations, but it is not a public consumer API.
_Avoid_: public syntax model, semantic tree

**Siren AST**:
The public simplified representation of Siren grammatical source for one document. It contains normalized resources, status modifiers, attributes, and tuple members, but no spans, raw text, trivia, comments, dependency resolution, validation, or inferred project semantics.
_Avoid_: semantic IR, source-preserving tree, parsed document model

**ParsedDocument**:
The public document wrapper returned by `@sirenpm/language` parsing. It exposes a `Siren AST`, structured language diagnostics, and CST-backed services such as formatting and decoding to core `SirenDocument` input, while keeping the CST private.
_Avoid_: AST node, project snapshot, language-level project builder

**Semantic IR**:
The meaning-focused project representation used for entries, dependencies, validation, and utilities.
_Avoid_: syntax tree, parsed document, source formatting model

**Language Diagnostic**:
Structured parse/decode warning or error produced by `@sirenpm/language`, with no embedded human-readable message. Language diagnostics use `WL` and `EL` code families; frontends assemble display text from structured fields.
_Avoid_: semantic diagnostic, formatted error string

**Tuple**:
The normalized AST representation of a Siren attribute expression as an ordered member list. The AST intentionally does not distinguish implicit tuple syntax from explicit bracket syntax.
_Avoid_: array-only value, scalar-only value

## Relationships

- A **Concrete Syntax Tree** is raised into one **Siren AST** per source document.
- A **ParsedDocument** owns the private **Concrete Syntax Tree** and public **Siren AST** for the same source document.
- A **Siren AST** is grammatical source data only; dependency resolution, duplicate detection, inferred status, and semantic diagnostics belong to **Semantic IR** in `@sirenpm/core`.
- Formatting walks the private **Concrete Syntax Tree**, not the **Siren AST**.
- `ParsedDocument.toSirenDocument()` decodes the **Siren AST** into core `SirenDocument` input and may use private CST backreferences to populate core `origin` metadata.
- `@sirenpm/language` does not expose a `ParsedDocument` to `SirenProject` helper; callers pass decoded `SirenDocument`s to `SirenBuilder.fromDocuments(...)`.
- Parsed documents omit core document directives until directive syntax exists in the grammar; absent directives leave core implicit milestone synthesis enabled by default.

## Example dialogues

> **Dev:** "Should cycle warnings live outside the project so callers compare diagnostic deltas?"
> **Domain expert:** "No — a `SirenProject` is the built semantic snapshot, so its diagnostics and entries are already colocated."

> **Dev:** "Should comments be stored on the Siren AST so formatting can use them?"
> **Domain expert:** "No — comments are source facts in the Concrete Syntax Tree. The Siren AST should only represent simplified grammatical source, and Semantic IR should only answer what the project means."

## Flagged ambiguities

- "context" was used to mean both a query-only view and a built snapshot — resolved: `SirenProject` is the built snapshot.
- "builder input" was used to mean a document wrapper — resolved: `SirenBuilder.fromEntries(entries)` accepts raw entries directly.
- "source" attribution was used to mean a separate constructor argument — resolved: resource origins provide attribution.
- "document" is overloaded between core build input and language parsing concepts — resolved: use `SirenDocument` for core input and `ParsedDocument` for the language wrapper.
- "parsed document model" previously named the language boundary — superseded: use **Siren AST** for the public source tree and **ParsedDocument** for the wrapper.
- "lossless syntax tree" and "parsed document model" were both used for the language boundary — superseded: use **Siren AST** for the public simplified source tree and **ParsedDocument** for the wrapper.
- "AST" can imply semantics in some ecosystems — resolved here: **Siren AST** is grammatical source data only and does not encode project semantics.


