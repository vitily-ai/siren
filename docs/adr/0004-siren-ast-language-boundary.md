---
status: accepted
supersedes: 0001-parsed-document-model-language-boundary
---

# Siren AST Is the Language Boundary

`@sirenpm/language` will expose a document-wise Siren AST as its public parsed source model and keep the Tree-sitter CST private. A `ParsedDocument` wrapper returned by parsing owns both the public AST and the private CST-backed services needed for diagnostics, formatting, and decoding to core `SirenDocument` input.

This supersedes the earlier Parsed Document Model boundary. The previous direction made a source-preserving model public so consumers could recover formatting, trivia, quoted spelling, and decode facts from one structure. The clean-slate language rewrite instead separates those concerns: the AST is a small grammatical-source tree, and the CST remains the source-authoritative structure for formatting and source attribution inside the language package.

## Context

The language package is being rebuilt from the grammar and fixture corpus. The current public source code has been removed, while the grammar subpackage remains the implementation jump-off point. The existing documentation still describes `ParseResult.syntaxDocuments`, `SyntaxTrivia`, and a public Parsed Document Model as the intended boundary, which conflicts with the new architecture.

The rewrite also targets a modified core contract where attribute values are tuple-first bare readonly arrays. That core migration is a prerequisite or external dependency for implementation, but it is not part of this language-package decision.

## Decision

The public parse primitive is document-wise: `parser.parse(document)` accepts a `SourceDocument` with `{ name, content }` and returns a `ParsedDocument`. The parser also exposes `parseBatch(documents)` as a convenience helper that independently parses each document.

`ParsedDocument` exposes:

- `ast`, the Siren AST for the source document;
- `diagnostics`, structured language diagnostics with no embedded display message;
- `toSirenDocument()`, which decodes the AST into core `SirenDocument` input;
- `format()`, which returns canonical Siren text from the private CST.

The Siren AST is a simplified representation of grammatical source. It contains normalized resources, resource status modifiers, attributes, and tuple members. It does not carry spans, raw text, comments, trivia classification, source-preserving layout, dependency resolution, duplicate analysis, inferred status, or semantic diagnostics.

The Tree-sitter CST and raw Tree-sitter nodes are not public API. They remain internal to `@sirenpm/language` and are used by `ParsedDocument` services for formatting, comment preservation, parse diagnostics, and `origin` metadata when decoding to core input.

`@sirenpm/language` does not provide a `ParsedDocument` to `SirenProject` helper. Callers that want a semantic project decode parsed documents to `SirenDocument[]` and call `SirenBuilder.fromDocuments(...)` from `@sirenpm/core` directly.

## Diagnostic Model

Language diagnostics are structured data, not formatted strings. They use the existing `WL` and `EL` prefix style but define a new taxonomy for the rebuilt architecture:

- `EL001`: syntax error or malformed resource omitted from the AST;
- `WL001`: unrecognized status modifier ignored;
- `WL002`: multiple recognized status modifiers collapsed, with the last recognized status winning.

`WL001` and `WL002` include contextual fields such as the resource identity, unrecognized modifier, candidate statuses, and resolved status. Frontends assemble human-readable messages from these fields.

## Decode Rules

`ParsedDocument.toSirenDocument()` performs local syntax normalization but not project-level semantic validation.

Every AST tuple decodes to the assumed tuple-first core value shape. Bare identifier tuple members decode as unresolved references. Quoted string tuple members normally decode as strings, but inside `depends_on` they decode as unresolved references so quoted resource IDs can be referenced.

Repeated status modifiers use last recognized status wins. Initially recognized statuses are `complete` and `draft`. Unknown statuses are ignored with `WL001`; repeated recognized statuses produce `WL002`.

Current parsed documents omit core document directives. Because core treats an absent directive as implicit milestone synthesis enabled, this preserves the current default without inventing source metadata. Future directive syntax must be represented directly in the AST when the grammar adds it.

## Formatting Rules

Formatting is CST-backed and canonical, not source-preserving. `ParsedDocument.format()` refuses to format documents with parse errors. It preserves all CST comment tokens but does not implement a trivia system; comments are emitted in lexical source order as standalone lines with canonical indentation. Blank-line counts and trailing-comment placement are not preserved in this phase.

## Consequences

The public language boundary is smaller and easier to test than a source-preserving syntax model. Consumers cannot depend on Tree-sitter node lifetimes or CST topology, and formatter behavior can evolve inside the language package without exposing raw parser structures.

The AST cannot answer formatting or source-location questions by itself. Any operation that needs comments, raw spelling, or source positions must go through `ParsedDocument` services.

The architecture assumes a tuple-first core value model. Until that core contract exists, implementation must either wait or use an explicit compatibility shim; silently targeting the current scalar/array core value model would contradict this decision.

## Alternatives Considered

Keeping the Parsed Document Model public would preserve a single source-aware structure for parse, decode, and formatting, but it would make source trivia and formatting concerns part of the consumer-facing API.

Exposing raw Tree-sitter nodes would make formatter implementation direct, but it would leak parser runtime details and node lifetime constraints into `@sirenpm/language` consumers.

Decoding parsed documents directly to `SirenProject` inside language would be convenient, but it would duplicate the core construction abstraction and hide the package boundary. Core already owns `SirenBuilder.fromDocuments(...)`.