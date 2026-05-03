# Parsed Document Model as the Language Boundary

Siren's language package will move its public decode and source-preserving export boundary from CST plus `SourceIndex` side tables to per-source-file Parsed Document Models exposed as `ParseResult.syntaxDocuments`. This is an intentional breaking API change: the CST remains useful as grammar-shaped parser output, but consumers that need semantic decode, formatting, comments, quoted identifier spelling, diagnostics, or future editor behavior should use Parsed Document Models rather than reconstructing source facts from semantic IR or comment side tables.

## Consequences

`createIRContextFromCst` and public `decodeDocument(cst)` are replaced by syntax-based APIs, `exportToSiren(ctx, sourceIndex)` is replaced by `exportToSiren(ctx, { syntaxDocuments })` for source-preserving export, and `SourceIndex` becomes internal legacy machinery until comment formatting is rewritten around Syntax Trivia. This PR intentionally scopes implementation to `@sirenpm/language`; CLI adoption is tracked as a follow-up dependency-bump change.
