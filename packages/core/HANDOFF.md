# Handoff: Siren Core Package

**Date**: January 12, 2026  
**Status**: Decoder MVP complete — resources, primitives, single references. Ready for demo.

---

## Current State

### ✅ What's Working

| Component | Status | Tests |
|-----------|--------|-------|
| Grammar (tree-sitter) | Complete | 8 corpus tests |
| WASM binary | Committed (7.8KB) | — |
| CST types | Complete | — |
| IR types | Complete | 5 type guard tests |
| Node adapter (test) | Complete | 11 adapter tests |
| Parser → CST | Complete | 22 fixture tests |
| **Decoder (CST → IR)** | **MVP** | 16 unit + 27 integration |

**Total: 82 tests passing in core, 84 across monorepo**

### Decoder Capabilities (MVP)

| Feature | Status | Notes |
|---------|--------|-------|
| Resources (type + id) | ✅ | Quotes stripped from IDs |
| Primitive attributes | ✅ | string, number, boolean, null |
| Single references | ✅ | `depends_on = other_task` |
| Arrays | ⏸️ Deferred | Skipped, not decoded |
| Circular dependency warning | ⏸️ Deferred | Not implemented |
| Position tracking | ⏸️ Deferred | Not implemented |

### What's NOT Implemented

- **Array values**: `depends_on = [A, B]` — arrays are skipped (filtered out)
- **Circular dependency detection**: No warning emitted yet
- **Semantic validation**: No reference resolution, duplicate checks, etc.
- **Diagnostics with positions**: No line/column in errors
- **App adapters**: Browser and CLI need real `ParserAdapter` implementations

---

## Architecture

### Package Structure
```
packages/core/
  src/
    ir/types.ts           # Semantic model: Document, Resource, Attribute, AttributeValue
    parser/adapter.ts     # ParserAdapter interface (env-agnostic)
    parser/cst.ts         # CST types matching grammar 1:1
    decoder/index.ts      # CST → IR transformation
    index.ts              # Public exports
  grammar/
    grammar.js            # Tree-sitter grammar definition
    tree-sitter-siren.wasm # Committed WASM binary
  test/
    fixtures/             # .siren test files (3 files)
    helpers/node-adapter.ts  # Test-only tree-sitter adapter
    integration/          # Parse + decode integration tests
```

### Data Flow
```
Source (.siren) → ParserAdapter.parse() → CST → decode() → IR (Document)
```

### Key Design Decisions

1. **CST ≠ IR**: Grammar can evolve without breaking consumers
2. **Adapters are external**: Core never imports `web-tree-sitter`
3. **Immutable IR**: All types are `readonly`
4. **No `any` types**: Discriminated unions + type guards
5. **WASM committed**: No C compiler needed by consumers
6. **`text` only on leaf nodes**: Removed from base `CSTNode` (YAGNI)

---

## Product Decisions (Documented)

| Behavior | Decision | Status |
|----------|----------|--------|
| Circular dependencies | Warning, not error | ⏸️ Not implemented |
| Empty arrays | Valid | ⏸️ Skipped (arrays deferred) |
| String literals | Strip quotes | ✅ Implemented |
| Forward references | TBD | — |
| Duplicate IDs | TBD | — |
| Mixed resource deps | TBD | — |
| Undefined references | TBD | — |
| Duplicate attributes | TBD | — |

---

## Resume Points

### To complete decoder (post-demo):

1. **Add array support** — decode `ArrayNode` → `ArrayValue`
2. **Circular dependency warning** — detect cycles in `depends_on`, emit diagnostic
3. **Empty array test** — verify `depends_on = []` decodes

### To add validation layer:

1. Create `src/validator/index.ts`
2. Reference resolution (check if referenced IDs exist)
3. Make product decisions on TBD behaviors
4. Add position tracking for quality diagnostics

### To wire up app adapters:

1. **Browser**: Copy `test/helpers/node-adapter.ts` to `apps/web/src/parser/adapter.ts`, adjust WASM loading for Vite
2. **CLI**: Copy to `apps/cli/src/parser/adapter.ts`, adjust WASM path

---

## Build Commands

```bash
# Grammar
cd packages/core/grammar
npx tree-sitter-cli generate      # Regenerate C parser
npx tree-sitter-cli build --wasm  # Rebuild WASM
npx tree-sitter-cli test          # Run corpus tests

# Core tests
yarn workspace @siren/core test        # All tests
yarn workspace @siren/core test:watch  # Watch mode

# Manual parse
cd packages/core/grammar
npx tree-sitter-cli parse ../test/fixtures/01-minimal.siren
```

---

## API Quick Reference

### Parsing + Decoding
```typescript
import { decode } from '@siren/core';
import type { ParserAdapter, DecodeResult } from '@siren/core';

// Adapter provided by app (browser or Node)
const adapter: ParserAdapter = await createAdapter();
const parseResult = await adapter.parse(source);

if (parseResult.success && parseResult.tree) {
  const decodeResult: DecodeResult = decode(parseResult.tree);
  // decodeResult.document contains IR
  // decodeResult.diagnostics contains warnings/errors
}
```

### IR Types
```typescript
interface Document {
  readonly resources: readonly Resource[];
}

interface Resource {
  readonly type: 'task' | 'milestone';
  readonly id: string;
  readonly attributes: readonly Attribute[];
}

interface Attribute {
  readonly key: string;
  readonly value: AttributeValue;
}

type AttributeValue = PrimitiveValue | ResourceReference | ArrayValue;

// Use type guards: isReference(), isArray(), isPrimitive()
```
