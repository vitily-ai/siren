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

**Origin**:
Source attribution metadata attached to resources and attributes. Carries byte/row offsets plus optional `document`.
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

- `SirenBuilder.fromResources(resources)` accepts raw `Resource`s only and has no `source?` parameter.
- `SirenBuilder.resources` returns frozen raw resources in caller order, including duplicates.
- `SirenBuilder.build()` is repeatable and non-consuming.
- `SirenProject.resources` returns deduplicated resources with implicit milestone completion applied.
- `SirenProject.graph` is cached so query helpers reuse the same dependency graph instance.
- `SirenProject.diagnostics` is the complete semantic snapshot and preserves the current ordering: cycles, dangling dependencies, then duplicates.
- W001 diagnostics expose dependency cycles; there is no separate public cycles API.
- Resource and diagnostic file attribution come from `origin.document`; missing attribution leaves `file` undefined.
- `SirenProject` is frozen and is only constructed internally by `SirenBuilder.build()`.
- The package-root export surface intentionally keeps the public snapshot and helper types together so consumers do not need deep imports.
- `SirenProject` provides `findResourceById()`, `getMilestoneIds()`, `getTasksByMilestone()`, `getDependencyTree()`, and `diagnostics` for consumers.

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
The meaning-focused project representation used for resources, dependencies, validation, and utilities.
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

## Example dialogue

> **Dev:** "Should cycle warnings live outside the project so callers compare diagnostic deltas?"
> **Domain expert:** "No — a `SirenProject` is the built semantic snapshot, so its diagnostics and resources are already colocated."

## Flagged ambiguities

- "context" was used to mean both a query-only view and a built snapshot — resolved: `SirenProject` is the built snapshot.
- "builder input" was used to mean a document wrapper — resolved: `SirenBuilder.fromResources(resources)` accepts raw resources directly.
- "source" attribution was used to mean a separate constructor argument — resolved: resource origins provide attribution.
- "document" is overloaded between core build input and language parsing concepts — resolved: use `SirenDocument` for core input and `ParsedDocument` for the language wrapper.
- "parsed document model" previously named the language boundary — superseded: use **Siren AST** for the public source tree and **ParsedDocument** for the wrapper.

---

# Siren Language Model

This context defines the project language for Siren source files, parsed documents, and semantic project-management data. It exists so parser, formatter, CLI, and future editor work use the same terms for the same concepts.

## Language

**Concrete Syntax Tree**:
The internal Tree-sitter parse tree for Siren source. It is source-authoritative for formatting, comments, raw spelling, and source locations, but remains private to `@sirenpm/language`.
_Avoid_: Public syntax model, semantic tree

**Siren AST**:
The public simplified representation of Siren grammatical source for one document. It contains normalized resources, status modifiers, attributes, and tuple members, but no spans, raw text, trivia, comments, dependency resolution, validation, or inferred project semantics.
_Avoid_: Semantic IR, source-preserving tree, parsed document model

**ParsedDocument**:
The public document wrapper returned by parsing. It exposes a **Siren AST**, structured language diagnostics, and CST-backed services such as formatting and `SirenDocument` decode, while keeping the **Concrete Syntax Tree** private.
_Avoid_: AST node, project snapshot, language-level project builder

**Semantic IR**:
The meaning-focused project representation used for resources, dependencies, validation, and utilities.
_Avoid_: Syntax tree, parsed document, source formatting model

**Language Diagnostic**:
Structured parse/decode warning or error produced by `@sirenpm/language`, with no embedded human-readable message. Language diagnostics use `WL` and `EL` code families; frontends assemble display text from structured fields.
_Avoid_: Semantic diagnostic, formatted error string

**Tuple**:
The normalized AST representation of a Siren attribute expression as an ordered member list. The AST intentionally does not distinguish implicit tuple syntax from explicit bracket syntax.
_Avoid_: Array-only value, scalar-only value

## Relationships

- A **Concrete Syntax Tree** is raised into one **Siren AST** per source document.
- A **ParsedDocument** owns the private **Concrete Syntax Tree** and public **Siren AST** for the same source document.
- A **Siren AST** is grammatical source data only; dependency resolution, duplicate detection, inferred status, and semantic diagnostics belong to **Semantic IR** in `@sirenpm/core`.
- Formatting walks the private **Concrete Syntax Tree**, not the **Siren AST**.
- `ParsedDocument.toSirenDocument()` decodes the **Siren AST** into core `SirenDocument` input and may use private CST backreferences to populate core `origin` metadata.
- `@sirenpm/language` does not expose a `ParsedDocument` to `SirenProject` helper; callers pass decoded `SirenDocument`s to `SirenBuilder.fromDocuments(...)`.
- Parsed documents omit core document directives until directive syntax exists in the grammar; absent directives leave core implicit milestone synthesis enabled by default.

## Example Dialogue

> **Dev:** "Should comments be stored on the Siren AST so formatting can use them?"
> **Domain expert:** "No — comments are source facts in the Concrete Syntax Tree. The Siren AST should only represent simplified grammatical source, and Semantic IR should only answer what the project means."

## Flagged Ambiguities

- "lossless syntax tree" and "parsed document model" were both used for the language boundary — superseded: use **Siren AST** for the public simplified source tree and **ParsedDocument** for the wrapper.
- "AST" can imply semantics in some ecosystems — resolved here: **Siren AST** is grammatical source data only and does not encode project semantics.
