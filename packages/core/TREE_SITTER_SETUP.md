# Tree-sitter Setup for Siren

## Architecture Overview

The Siren core uses tree-sitter for parsing with a **strict portability constraint**: the core library must remain environment-agnostic (no Node or DOM APIs).

### Component Structure

```
packages/core/
  src/
    ir/              # Intermediate Representation (IR) types
    parser/          # Parser interfaces and CST types
  grammar/           # Tree-sitter grammar definition
  test/fixtures/     # Example .siren files for testing
```

## Type System

### IR Types (`src/ir/`)

**Purpose**: Semantic model used by all consumers after parsing and validation.

**Key types**:
- `Document`: Root containing all resources
- `Resource`: Task or milestone with attributes
- `AttributeValue`: Union of primitives, references, arrays
- Type guards: `isReference()`, `isArray()`, `isPrimitive()`

**Guarantees**:
- Immutable (readonly)
- Discriminated unions for type safety
- No `any` types
- Location information for diagnostics

### CST Types (`src/parser/cst.ts`)

**Purpose**: Raw syntax tree from tree-sitter before semantic analysis.

**Key types**:
- `DocumentNode`, `ResourceNode`, `AttributeNode`
- `ExpressionNode`: Union of literals, references, arrays
- Position tracking for all nodes

**Why separate from IR**: CST is 1:1 with grammar, IR is semantic model. Decoupling allows grammar evolution without breaking consumers.

## Parser Adapter Pattern

### Interface (`src/parser/adapter.ts`)

```typescript
interface ParserAdapter {
  parse(source: string): Promise<ParseResult>;
}
```

**Purpose**: Isolate environment-specific tree-sitter loading from core logic.

**Initialization Pattern**:
- **Stub** (`src/parser/stub.ts`): Synchronous constructor - for unit tests, returns hardcoded CST
- **Real adapters** (future: `apps/web`, `apps/cli`): Async factory functions (e.g., `TreeSitterAdapter.create()`)
- Adapters are always ready when constructed - no two-phase initialization or runtime checks

**Implementations**:
- **Browser** (future: `apps/web`): Loads WASM via `web-tree-sitter`
- **Node** (future: `apps/cli`): Loads WASM via `web-tree-sitter` Node adapter

**Why async**: WASM loading is inherently async in browsers. Factory pattern makes uninitialized states unrepresentable.

## Grammar (`grammar/`)

### Minimal Grammar Rules

Based on HCL syntax, supporting:
- **Resources**: `task`/`milestone` blocks with identifiers (bare or quoted)
- **Attributes**: `key = value` assignments
- **Values**: strings, numbers, booleans, null, identifiers (references), arrays
- **Comments**: `#` and `//` style

### Building the Grammar

```bash
cd packages/core/grammar
yarn install
yarn build  # runs: tree-sitter generate && tree-sitter build-wasm
```

**Outputs**:
- `src/` (generated C parser, gitignored)
- `tree-sitter-siren.wasm` (committed artifact for apps to bundle)

### Test Corpus

Tree-sitter tests go in `grammar/test/corpus/`:
```
==================
Simple task
==================

task example {
  description = "test"
}

---

(document
  (resource
    (identifier)
    (attribute (identifier) (string_literal))))
```

## Design Principles

1. **No pre-building core**: Apps compile core as part of their build; grammar WASM is the only pre-built artifact
2. **Error recovery**: Grammar must produce partial trees, not fail on first error
3. **Forward compatibility**: Grammar should accept unknown resource types/attributes (validated semantically later)
4. **Type safety**: No `any` types; discriminated unions everywhere

## Next Steps

1. **Generate grammar**: Run `yarn build` in `grammar/` to produce WASM
2. **Browser adapter**: Implement `ParserAdapter` in `apps/web` using `web-tree-sitter`
3. **Node adapter**: Implement `ParserAdapter` in `apps/cli` using `web-tree-sitter/node`
4. **Decoder**: Write CST → IR transformation with validation
5. **Diagnostics**: Add error codes and structured diagnostics

## Testing Strategy

- **Unit tests**: Use `StubParserAdapter` to test decoder logic in isolation
- **Integration tests**: Use real adapter + grammar to parse fixture files
- **Corpus tests**: Tree-sitter's own test framework for grammar validation

## Non-Negotiables

- Core must never import `web-tree-sitter` directly
- All grammar changes require corresponding CST type updates
- No environment-specific APIs in `packages/core/src`
- All IR types must be readonly
