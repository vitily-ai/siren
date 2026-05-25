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

The Siren AST is the public parsed source tree. It is deliberately small: normalized resources, a single resolved status modifier, attributes, and tuple members. It does not carry public spans, raw text, comments, trivia, dependency resolution, duplicate analysis, inferred status, or semantic diagnostics. The package keeps origin data on a private sidechannel so `toSirenDocument()` can attach core `origin` metadata without exposing spans on the public AST.

`ParsedDocument` is the public wrapper returned by the parser. It exposes the AST and language diagnostics, and it owns CST-backed services such as formatting and decoding to `SirenDocument`.

## Public API Shape

The main public parser surface is:

```ts
const parser = await createParser();
const parsed = await parser.parse({ name: 'siren/main.siren', content });
const parsedDocuments = await parser.parseBatch(sourceDocuments);
```

The package root also re-exports the public AST and language diagnostic types, along with the diagnostic constructor helpers.

`ParsedDocument` exposes:

```ts
parsed.ast;
parsed.diagnostics;
parsed.toSirenDocument();
parsed.format();
```

`parse()` and `parseBatch()` return `Promise`s for API uniformity. Under the hood, tree-sitter parsing is synchronous, and `parseBatch()` currently processes documents sequentially on a single parser instance.

Language does not provide a `ParsedDocument` to `SirenProject` helper. Project construction remains explicit through core:

```ts
const documents = parsedDocuments.map((document) => document.toSirenDocument());
const project = SirenBuilder.fromDocuments(documents).build();
```

## Siren AST

The Siren AST represents grammatical source, not project semantics.

- Resource types and IDs are normalized strings.
- Resource status is a single optional normalized modifier: `complete` or `draft`.
- Multiple recognized modifiers collapse to the last recognized status and emit `WL002`.
- Unrecognized modifiers are ignored in the AST and emit `WL001`.
- Attributes have normalized string keys.
- Attribute expressions are normalized tuples represented as readonly member arrays.
- The AST does not distinguish implicit tuple syntax from explicit bracket syntax.
- Identifiers are normalized strings only; quoted or bare source spelling remains CST-internal.

Resources whose CST subtree contains parse errors are omitted from the AST. Valid sibling resources in the same document remain available.

## Decode To Core Input

`ParsedDocument.toSirenDocument()` performs local syntax normalization into core build input. It does not resolve dependencies, detect duplicate resources, infer completion, or produce semantic diagnostics.

Decode rules:

- The decoded document id comes from `SourceDocument.name`, stripping a trailing `.siren` extension when present.
- Every AST tuple decodes directly to core `Attribute.value` as `readonly Atom[]`.
- String, number, and boolean scalars decode as single-element tuples.
- Bare identifier tuple members decode as unresolved references everywhere.
- Quoted string tuple members normally decode as strings.
- Quoted string tuple members inside `depends_on` decode as unresolved references so quoted resource IDs can be referenced.
- The AST already exposes only the resolved recognized status; repeated recognized modifiers are collapsed before decode.
- Current parsed documents omit core document directives; decoded documents therefore omit `directive` and rely on core's absent-directive behavior.
- Resource and attribute `origin` metadata is populated from the package-private origin map when available.

`toSirenDocument()` does not resolve dependencies or add semantic warnings; those remain core responsibilities.

## Diagnostics

Language diagnostics are structured data with no embedded display message. Frontends format messages from diagnostic code, severity, location, and contextual fields.

Current language code table:

| Code | Severity | Meaning | Structured fields |
| --- | --- | --- | --- |
| `EL001` | error | Syntax error or malformed node omitted from the AST | `documentName`, `nodeType`, optional `resourceId`, optional `origin` |
| `WL001` | warning | Unrecognized status modifier ignored | `documentName`, `resourceId`, `modifier`, optional `origin` |
| `WL002` | warning | Multiple recognized status modifiers collapsed; last recognized status wins | `documentName`, `resourceId`, `recognizedModifiers`, `resolvedStatus`, optional `origin` |

Semantic diagnostics remain in `@sirenpm/core` as W001-W003 and are exposed from `SirenProject.diagnostics`.

## Formatting

Formatting is CST-backed and canonical. It is not source-preserving formatting, and it does not render from the normalized AST.

`ParsedDocument.format()`:

- throws when the document still has language errors or unrecovered tree-sitter parse errors;
- emits deterministic canonical Siren text;
- preserves all comments from the CST;
- emits comments in lexical source order as standalone lines with canonical indentation;
- formats resource headers from the CST, so repeated modifiers remain visible even though the AST stores only the resolved status;
- does not preserve blank-line counts;
- does not preserve trailing-comment placement;
- does not implement leading/trailing/detached trivia classification in the first phase.

## Grammar

The Tree-sitter grammar and committed WASM artifact live in `grammar/`. The grammar currently supports repeated arbitrary `status_modifier` entries in resource headers. The parser raises the grammar-shaped CST into the public Siren AST.

When grammar rules change, update corpus tests under `grammar/test/corpus/` and regenerate the committed WASM artifact as described in `grammar/README.md`.

## Testing

Use focused workspace commands while rebuilding:

```bash
yarn workspace @sirenpm/language typecheck
yarn workspace @sirenpm/language test
yarn workspace @sirenpm/grammar generate
yarn workspace @sirenpm/grammar build
yarn workspace @sirenpm/grammar test
```

If you change `grammar/grammar.js`, regenerate and rebuild the committed WASM artifact in the same change.

Current executable unit tests live alongside the implementation under `src/**/*.test.ts`; `test/fixtures/` holds shared fixtures.

Add tests at the layer that owns the behavior:

- parser tests for single-document parsing and `parseBatch` aggregation;
- AST tests for normalized resources, status modifiers, identifiers, tuples, and parse-error omission;
- decode tests for tuple-first values, status diagnostics, dependency references, directive omission, and origins;
- formatter tests for canonical output, parse-error refusal, and comment preservation;
- CLI golden tests only when CLI behavior changes.