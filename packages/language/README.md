# @sirenpm/language

`@sirenpm/language` owns the Siren source-language layer: Tree-sitter grammar loading, parsing, Siren AST construction, language diagnostics, decoding parsed documents to core `SirenDocument` input, and canonical formatting.

The package depends on `@sirenpm/core` for IR types, but core never imports from language.

## Architecture

The language pipeline is document-wise:

```text
SourceDocument
  -> private Tree-sitter CST
  -> public Siren AST
  -> ParsedDocument services
  -> SirenDocument
  -> SirenBuilder.fromDocuments(...) (core-owned)
```

The Concrete Syntax Tree is private to this package. It remains the source-authoritative structure for formatting, comments, raw spelling, parse recovery, and origin metadata. Consumers do not receive raw Tree-sitter nodes or a public CST wrapper.

The Siren AST is the public parsed source tree. It is deliberately small: normalized resources, status modifiers, attributes, and tuple members. It does not carry spans, raw text, comments, trivia, dependency resolution, duplicate analysis, inferred status, or semantic diagnostics.

`ParsedDocument` is the public wrapper returned by the parser. It exposes the AST and language diagnostics, and it owns CST-backed services such as formatting and decoding to `SirenDocument`.

## Public API Shape

The rebuilt parser surface is:

```ts
const parser = await createParser();
const parsed = await parser.parse({ name: 'siren/main.siren', content });
const parsedDocuments = await parser.parseBatch(sourceDocuments);
```

`ParsedDocument` exposes:

```ts
parsed.ast;
parsed.diagnostics;
parsed.toSirenDocument();
parsed.format();
```

Language does not provide a `ParsedDocument` to `SirenProject` helper. Project construction remains explicit through core:

```ts
const documents = parsedDocuments.map((document) => document.toSirenDocument());
const project = SirenBuilder.fromDocuments(documents).build();
```

## Siren AST

The Siren AST represents grammatical source, not project semantics.

- Resource types and IDs are normalized strings.
- Resource status modifiers are ordered normalized strings.
- Attributes have normalized string keys.
- Attribute expressions are normalized tuples represented as readonly member arrays.
- The AST does not distinguish implicit tuple syntax from explicit bracket syntax.
- Identifiers are normalized strings only; quoted or bare source spelling remains CST-internal.

Resources whose CST subtree contains parse errors are omitted from the AST. Valid sibling resources in the same document remain available.

## Decode To Core Input

`ParsedDocument.toSirenDocument()` performs local syntax normalization into core build input. It does not resolve dependencies, detect duplicate resources, infer completion, or produce semantic diagnostics.

The language architecture targets an assumed modified core contract where `Attribute.value` is tuple-first: a bare readonly tuple array of atoms. The core migration itself is not part of this package. Until that contract exists, implementation must either wait or use an explicit compatibility shim.

Decode rules:

- Every AST tuple decodes to the tuple-first core value shape.
- Bare identifier tuple members decode as unresolved references everywhere.
- Quoted string tuple members normally decode as strings.
- Quoted string tuple members inside `depends_on` decode as unresolved references so quoted resource IDs can be referenced.
- Repeated recognized status modifiers collapse with last recognized status winning.
- Unknown status modifiers are ignored with language diagnostics.
- Current parsed documents omit core document directives; core treats absent directives as implicit milestone synthesis enabled.

`toSirenDocument()` may use private CST backreferences to populate core `origin` metadata while keeping the AST itself span-free.

## Diagnostics

Language diagnostics are structured data with no embedded display message. Frontends format messages from diagnostic code, severity, location, and contextual fields.

Initial language code table:

| Code | Severity | Meaning |
| --- | --- | --- |
| `EL001` | error | Syntax error or malformed resource omitted from the AST |
| `WL001` | warning | Unrecognized status modifier ignored |
| `WL002` | warning | Multiple recognized status modifiers collapsed; last recognized status wins |

Semantic diagnostics remain in `@sirenpm/core` as W001-W003 and are exposed from `SirenProject.diagnostics`.

## Formatting

Formatting is CST-backed and canonical. It is not source-preserving formatting.

`ParsedDocument.format()`:

- refuses to format documents with parse errors;
- emits deterministic canonical Siren text;
- preserves all comments from the CST;
- emits comments in lexical source order as standalone lines with canonical indentation;
- does not preserve blank-line counts;
- does not preserve trailing-comment placement;
- does not implement leading/trailing/detached trivia classification in the first phase.

## Grammar

The Tree-sitter grammar and committed WASM artifact live in `grammar/`. The grammar currently supports repeated arbitrary `status_modifier` entries in resource headers. The parser raises the grammar-shaped CST into the public Siren AST.

When grammar rules change, update corpus tests under `grammar/test/corpus/` and regenerate the committed WASM artifact as described in `grammar/README.md`.

## Testing

Use focused package commands while rebuilding:

```bash
yarn workspace @sirenpm/language grammar:test
yarn workspace @sirenpm/language typecheck
yarn workspace @sirenpm/language test
```

Add tests at the layer that owns the behavior:

- parser tests for single-document parsing and `parseBatch` aggregation;
- AST tests for normalized resources, status modifiers, identifiers, tuples, and parse-error omission;
- decode tests for tuple-first values, status diagnostics, dependency references, directive omission, and origins;
- formatter tests for canonical output, parse-error refusal, and comment preservation;
- CLI golden tests only when CLI behavior changes.