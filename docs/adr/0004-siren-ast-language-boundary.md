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
- `toEntries()`, which decodes the AST into core `SirenEntry[]` input (renamed from `toSirenDocument()` per core v0.6.0 flat-entries contract);
- `format()`, which returns canonical Siren text from the private CST;
- `patchEntry(id, entry)`, which mutates a parsed entry's source in-place by splicing a canonical rendering of the given entry into the source buffer, then re-parsing and re-decoding;
- `removeEntry(id)`, which removes a parsed entry by splicing out its source span, then re-parsing and re-decoding;
- `source`, a `SourceDocument` getter returning the current (possibly mutated) source name and content.

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

## Subsequent Decision: Entry Mutation and Render-to-Source

### Context

`ParsedDocument.format()` renders canonical text by walking the private Tree-sitter CST. It can only emit what was parsed — it has no ability to include entries created or mutated programmatically (e.g., synthetic milestones generated by the decoder, entries modified via `SirenBuilder.patchEntry()`, or entirely new entries produced by CLI mutation commands). Meanwhile, the installed `@sirenpm/language` package contained a `renderSyntaxDocument()` function unavailable in the workspace source tree, creating a gap between the published API and the source.

The CLI format command is read-only (parse → format → write). A separate class of CLI mutation commands (e.g., `siren edit`, `siren set`) needs to modify entries and write the result back to `.siren` source. To support this without writing a separate string renderer, `ParsedDocument` gains the ability to mutate its internal source and re-parse.

### Decision

`ParsedDocumentImpl` acquires mutation capabilities through a splice-and-reparse pipeline:

1. **Internal `renderEntry(entry)` module** — A new `packages/language/src/render-entry.ts` module renders a single `SirenEntry` to canonical `.siren` block text. It is internal (not exported from `@sirenpm/language`) and always produces deterministic output. Rendering rules:
   - `EntryReference` atoms render as bare identifiers (quoted with double quotes when the identifier contains characters outside `[a-zA-Z_][a-zA-Z0-9_-]*`).
   - String atoms render as double-quoted strings; number atoms as number literals; boolean atoms as `true`/`false`.
   - Multi-atom tuples render as comma-separated values without surrounding brackets (`key = a, b, c`).
   - Single-atom tuples render as bare values without brackets (`key = value`).
   - Empty tuple attributes are omitted from the output entirely.
   - Status (`draft`/`complete`) renders as a modifier after the resource type keyword (`task id complete { ... }`).
   - Empty resource bodies render as `task id {}`.

2. **`patchEntry(id, entry)`** — Traverses the current CST (`#tree`) to find the resource node whose identifier matches `id`, reads its `startIndex`/`endIndex` fresh (no cached span map — avoids stale offsets). Splices the `renderEntry` output into `#source.content` at that byte range. When no source span exists (new or synthetic entry), appends the rendered block to the end of the source. Performs an incremental re-parse (`tsParser.parse(newSource, oldTree)`) and re-decodes to update `#ast`, `#diagnostics`, `#entries`, and `#origins`. Throws if the re-parse fails (indicates a bug in `renderEntry`).

3. **`removeEntry(id)`** — Same span lookup and splice-out logic, then re-parse and re-decode.

4. **`format()` becomes mutating** — After computing the canonical text via `formatCst()`, updates `#source.content` to the canonical form, then re-parses and re-decodes. Subsequent `.source` calls return the canonicalized source.

5. **Greedy decode at construction** — `ParsedDocumentImpl` decodes entries eagerly in the constructor and caches them in `#entries`. `toEntries()` returns this cache. After each mutation (`patchEntry`, `removeEntry`, `format`), the cache is refreshed via re-decode. The decode cost at construction is trivial for typical `.siren` files (dozens of entries), and the simplicity of a single cached source of truth outweighs the marginal overhead for consumers that only need `.ast` or `.format()`.

6. **`.source` getter** — Returns `{ name, content }` (a `SourceDocument`), exposing the current source state for consumers (e.g., the CLI) to write to disk.

### Mutability Model

Mutation is hybrid: the internal private fields (`#tree`, `#source`, `#entries`) can change, but the public surface remains typed as readonly references. This avoids introducing immutable-copy overhead while keeping the public API predictable. After any mutation, all derived state (`#ast`, `#diagnostics`, `#entries`, `#origins`) is rebuilt from the re-parsed tree — there is no partial or stale cache.

### Comment Preservation

Comments associated with a spliced entry are lost on `patchEntry` — the replacement block is canonical and comment-free. This is acceptable because the primary use case (CLI mutation commands) replaces an entry wholesale; callers that need comment preservation should route through `format()` (which preserves CST comments in lexical order) and delegate comment management to a higher-level tool.

### Consequences

- CLI mutation commands can now parse a file, modify entries via `patchEntry`/`removeEntry`, and write `.source` to disk — without a separate string-based renderer.
- The `format()` semantics change from pure to mutating. Existing callers that rely on `format()` being non-destructive must adjust.
- `renderEntry` is intentionally not public: consumers that need entry-to-text rendering should round-trip through `ParsedDocument` services. Keeping it internal avoids committing to a rendering contract outside the context of a parsed document.
- The CST traversal for span lookup is a linear scan of resource nodes per `patchEntry` call. For files with hundreds of entries this is negligible; if performance becomes a concern, a span cache with invalidation on mutation can be added later.

### Separate `renderEntry` Public API

Exporting `renderEntry(entry)` as a standalone public function would let consumers render entries without a `ParsedDocument` context. Rejected: the rendering rules (quoting, bracket elision, status modifier placement) are inseparable from the grammar version that produced the entries. Making them a public API would freeze the rendering contract across grammar versions and encourage callers to build standalone rendering pipelines outside `ParsedDocument` services, duplicating the splice-and-reparse logic.

### Source-Preserving SyntaxDocument Model (Previous Direction)

The original ADR-0001 direction and the current installed `@sirenpm/language` package use a `SyntaxDocument` model with trivia classification, source spans on every token, and a `renderSyntaxDocument()` function. This approach can round-trip with full comment and formatting fidelity. Rejected because it makes trivia and source spans a public concern, duplicates work between the CST and the syntax model, and the `renderSyntaxDocument()` function needs to be kept in sync with the grammar — a maintenance burden that the CST-back approach avoids by construction.

### Standalone String Renderer for Entries

Building a `renderEntry` that is a standalone string concatenation (no CST involvement) was considered as the simplest option. Rejected because it creates a second, independent rendering path that must be kept in sync with the grammar's canonical output format. The splice-and-reparse approach ensures all output eventually flows through `formatCst`, giving a single canonical output path.