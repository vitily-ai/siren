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
