# Handoff: Tree-sitter Grammar & Type System

**Date**: January 12, 2026  
**Status**: Grammar + parser working, 39 tests passing, ready for decoder implementation

---

## Current State

### 1. Type System (Fully Typed, Zero `any`)

**IR Types** ([src/ir/types.ts](src/ir/types.ts)):
- Semantic model for parsed Siren documents
- `Document → Resource[] → Attribute[] → AttributeValue`
- `AttributeValue` = discriminated union: `PrimitiveValue | ResourceReference | ArrayValue`
- Type guards: `isReference()`, `isArray()`, `isPrimitive()`
- All types readonly/immutable
- Position/location tracking deferred until diagnostics implementation

**CST Types** ([src/parser/cst.ts](src/parser/cst.ts)):
- Raw syntax tree matching grammar 1:1
- `DocumentNode → ResourceNode[] → AttributeNode[]`
- `ExpressionNode` = union: `LiteralNode | ReferenceNode | ArrayNode`
- Position tracking deferred (will be added in Step 5)

**Why separate**: Grammar can evolve without breaking consumers. CST → IR transformation is explicit validation/decoding step.

### 2. Grammar (Working, 8 Tests Passing)

**File**: [grammar/grammar.js](grammar/grammar.js)

**What it parses**:
```siren
# Both resource types supported
task example_task {
  description = "Task description"
  points = 3
  blocking = true
}

milestone "Q1 Launch" {
  quarter = "Q1"
  year = 2026
  depends_on = [example_task]
}
```

**Features**:
- Resources: `task` | `milestone` with bare or quoted IDs
- Attributes: `key = value` syntax
- Values: strings, numbers, booleans, null, references (bare identifiers), arrays
- Comments: `#` and `//` style
- Error recovery: Produces partial trees on errors (tree-sitter design)

**Build artifacts**:
- WASM: [grammar/tree-sitter-siren.wasm](grammar/tree-sitter-siren.wasm) (7.8KB, committed)
- C parser: `grammar/src/parser.c` (gitignored, regenerate via `npx tree-sitter-cli generate`)

**Tests**: [grammar/test/corpus/basic.txt](grammar/test/corpus/basic.txt) - 8 corpus tests all passing

### 3. Parser Infrastructure (Test-Ready)

**Interface**: [src/parser/adapter.ts](src/parser/adapter.ts)

```typescript
interface ParserAdapter {
  parse(source: string): Promise<ParseResult>;
}
```

**Why**: Core must never import `web-tree-sitter` or any environment-specific code. Apps provide implementations.

**Initialization**: Adapters use async factory pattern (e.g., `createNodeAdapter()`). Always ready when constructed.

**Implementations**:
- ✅ **Node adapter** ([test/helpers/node-adapter.ts](test/helpers/node-adapter.ts)): Full tree-sitter integration for tests (NOT exported from package)
- ❌ **Browser adapter**: Create in `apps/web` (see [ADAPTER_EXAMPLE.md](ADAPTER_EXAMPLE.md))
- ❌ **Node CLI adapter**: Create in `apps/cli`

**Test helper**: [test/helpers/parser.ts](test/helpers/parser.ts) provides `getTestAdapter()` for cached adapter instance.

---

### ✅ Working
- Grammar compiles to WASM (7.8KB committed)
- **39 tests passing**:
  - 5 IR type guard tests
  - 11 node adapter tests (all value types, error recovery)
  - 22 fixture integration tests (3 fixture files)
  - 1 package smoke test
- 8 grammar corpus tests passing
- Type system complete and sound
- Real tree-sitter parsing in all tests

### ❌ Not Implemented
- **CST → IR decoder**: Transform tree-sitter nodes to IR types
- **Semantic validation**: Reference resolution, circular dependency detection
- **Diagnostics**: Error codes, structured error messages with positions
- **App adapters**: Browser and CLI need real ParserAdapter implementations

---Product Decisions (Documented)

The following semantic behaviors have been decided:

1. **Circular dependencies**: **Warning, not error** - IR should surface to user but not panic
2. **Empty arrays**: **Valid** - `depends_on = []` should parse without issue
3. **String literals**: **Strip quotes** - `"hello"` decodes to `hello` (not `"hello"`)
4. **Forward references**: TBD - needs product decision
5. **Duplicate IDs**: TBD - needs product decision
6. **Mixed resource deps**: TBD - needs product decision
7. **Undefined references**: TBD - needs product decision
8. **Duplicate attributes**: TBD - needs product decision

---

## ⚠️ Test Coverage Gaps

### What's Tested (✅ Comprehensive)
- **Grammar corpus**: 8/8 passing - all syntactic elements
- **IR type guards**: Primitive/reference/array discrimination
- **Node adapter**: All value types (string, number, boolean, null, reference, array)
- **Fixtures**: 3 files with 22 integration tests
- **E2. Edge Cases Needing Tests
- ✅ Empty arrays: `depends_on = []` (adapter handles, needs integration test)
- ✅ Null values: `optional = null` (tested in node-adapter.test.ts)
- ⚠️ Unicode identifiers: `task "日本語" { }` (untested)
- ⚠️ Nested arrays: `matrix = [[1, 2], [3, 4]]` (untested)
- ⚠️ Escape sequences: `text = "Line 1\nLine 2"` (untested)
- ⚠️ Trailing commas: `list = [A, B,]` (untested)
- ⚠️ Duplicate attributes: `task T { x = 1 x = 2 }` (untested - needs decision)
- ⚠️ Large numbers: `points = 999999999999` (untested)

**Action**: Add edge case tests to `test/integration/node-adapter.test.ts` or new test file|
| Duplicate IDs | ⚠️ TBD | `task X { } task X { }` |
| Circular deps | ✅ Warning | Write test expecting diagnostic, not error |
| Mixed resource deps | ⚠️ TBD | `task T { depends_on = M } milestone M { }` |
| U# 3. Error Recovery Fixture (NICE TO HAVE)
Add `test/fixtures/04-malformed.siren` with intentional syntax errors to test partial tree handling.

---

## Acceptance Criteria for Decoder PR

Do **not** merge decoder without:
- [ ] All 3 fixtures decode successfully to IR
- [ ] CST → IR transformation tests for all value types
- [ ] Circular dependency warning (not error) implemented and tested
- [ ] Empty array handling verified
- [ ] String quote stripping verified
- [ ] Undecided semantic behaviors documented as TODO or skipped tests
5. CST → IR transformation tests (every value type)
6. Position preservation through decode
7. Diagnostic quality (codes, spans, suggestions)
8. All 3 fixtures decode to valid IR

**Phase 3 (With Real Adapters)**:
9. Browser WASM loading
10. Node WASM loading
11. Environment parity (same source → same IR)

### Acceptance Criteria for Decoder PR

Do **not** merge decoder without:
- [ ] All 3 fixtures parse and decode successfully
- [ ] Position data preserved in IR
- [ ] At least 5 error recovery scenarios tested
- [ ] Semantic validation behavior documented via tests
- [ ] Edge cases (null, empty arrays, unicode) verified
Remaining Test Gaps (OPTIONAL)

**Before decoder work** (recommended but not blocking):

1. **Get product decisions** on undecided semantic behaviors:
   - Forward references (allow or reject?)
   - Duplicate IDs (error or last-wins?)
   - Mixed resource dependencies (task→milestone OK?)
   - Undefined references (error or warning?)
   - Duplicate attributes (error, last-wins, or keep both?)

2. **Create semantic validation test stubs** in `src/validator/index.test.ts`:
   - Circular dependency warning test (decision already made)
   - Tests for undecided behaviors (can be skipped/pending)
   - Document expected diagnostic codes and messages

3. **Add edge case tests** to `test/integration/node-adapter.test.ts`:
   - Empty array parsing
   - Unicode identifiers
   - Nested arrays
   - Escape sequences
   - Large numbers
   - Trailing commas

**Estimated effort**: 3-4 hours  
**Blocker status**: Not blocking decoder work, but reduces risk of rework
   - Nested arrays, large numbers, escape sequences
   - Duplicate attributes within same resource

**Estimated effort**: 2-4 hours  
**Blocker status**: Decoder cannot be validated without these

---

### Step 1: Implement CST → IR Decoder

**Create**: `packages/core/src/decoder/index.ts`  
**Prerequisite**: Step 0 complete ✓

**Function signature**:
```typescript
export function decode(cst: DocumentNode): DecodeResult {
  // Transform CST → IR
  // Collect semantic errors (undefined references, type mismatches)
  // Return Document IR + diagnostics
}

export interface DecodeResult {
  document: Document | null;
  diagnostics: Diagnostic[];

**Function signature**:
```typescript
export function decode(cst: DocumentNode): DecodeResult {
  // Transform CST → IR
  // Collect diagnostics (circular deps produce warning, not error)
  // Return Document IR + diagnostics
}

export interface DecodeResult {
  document: Document | null;
  diagnostics: Diagnostic[];
  success: boolean;
}

export interface Diagnostic {
  code: string;           // e.g., 'W001' for circular dependency warning
  message: string;
  severity: 'error' | 'warning' | 'info';
}
```

**Key logic**:
1. Walk CST recursively
2. Convert `LiteralNode` → primitive value (strip quotes from strings!)
3. Convert `ReferenceNode` → `ResourceReference`
4. Convert `ArrayNode` → `ArrayValue` (handle empty arrays)
5. Convert `ResourceNode` → `Resource`
6. Convert `AttributeNode` → `Attribute`
7. Validate circular dependencies → emit warning diagnostic

**Tests**: Use `getTestAdapter()` to parse source, then decode CST to
import Parser from 'web-tree-sitter';
Reference**: Copy implementation from [test/helpers/node-adapter.ts](test/helpers/node-adapter.ts) and adapt for browser.

**Key differences from Node version**:
- Use `Language.load('/tree-sitter-siren.wasm')` (served by Vite)
- No `fs` or `path` imports
- Copy `packages/core/grammar/tree-sitter-siren.wasm` to `apps/web/public/`

**Dependencies**: 
```bash
cd apps/web
yarn add web-tree-sitter
```

### Step 3: Implement Node CLI ParserAdapter

**Create**: `apps/cli/src/parser/adapter.ts`

**Reference**: Copy directly from [test/helpers/node-adapter.ts](test/helpers/node-adapter.ts) with minimal changes.

**Key differences from test version**:
- Adjust WASM path to `../../grammar/tree-sitter-siren.wasm` (or bundle it)
- Export as public API, not test infrastructure

**Dependencies**:
```bash
cd apps/cli
yarn add web-tree-sitter
- (Future) Custom validation rules per resource type

**Return**: Array of `Diagnostic` with codes, locations, suggestions.

### Step 5: Add Position Tracking (Diagnostics)

**When**: After error reporting design is finalized

**Changes needed**:
1. Add position fields to `CSTNode` interface (in [src/parser/cst.ts](src/parser/cst.ts)):
   ```typescript
   readonly startPosition: { row: number; column: number };
   readonly endPosition: { row: number; column: number };
   ```
2. Real parser adapters populate from tree-sitter node locations
3. Optionally add `location?` fields to IR types if needed for diagnostics
4. Diagnostics use positions for error messages with source context

**Why deferred**: Bootstrap only needs "does it parse", not "where did it fail". Position tracking is infrastructure for quality error messages, not core functionality. IR types deliberately omit `location` fields until diagnostic needs are clear.

**Test requirements when implemented**:
- Position data present and non-null
- Nested nodes have valid parent spans
- Validation rules**:
1. **Circular dependencies**: Detect cycles in `depends_on` → emit **warning** (not error)
2. **Undefined references**: Check if referenced IDs exist → emit error/warning (decision TBD)
3. **Forward references**: Allow or reject (decision TBD)
4. **Duplicate IDs**: Handle duplicates (decision TBD)
5. **Mixed resource deps**: Validate task→milestone dependencies (decision TBD)

**Return**: Array of `Diagnostic` with codes, messages, severity

### Core Package
```
packages/core/
  src/
    ir/
      types.ts          ← IR type definitions (complete)
      index.ts          ← Public exports
    parser/
      adapter.ts        ← ParserAdapter interface (complete)
      cst.ts            ← CST node types (complete)
      stub.ts           ← Stub for tests (complete)
      index.ts          ← Public exports
    decoder/            ← YOU CREATE THIS
      index.ts          ← CST → IR transformation
      index.test.ts     ← Decoder tests
    validator/          ← YOU CREATE THIS (later)
      index.ts          ← Semantic validation
    index.ts            ← Package entry (exports all)
  grammar/
    grammar.js          ← Grammar definition (complete)
    tree-sitter-siren.wasm  ← WASM artifact (complete)
    test/corpus/
      basic

### Core Package (What Exists)
```
packages/core/
  src/
    ir/
      types.ts          ← IR type definitions ✅
      index.ts          ← Public exports ✅
    parser/
      adapter.ts        ← ParserAdapter interface ✅
      cst.ts            ← CST node types ✅
      index.ts          ← Public exports ✅
    decoder/            ← YOU CREATE THIS ❌
      index.ts          ← CST → IR transformation
      index.test.ts     ← Decoder tests
    validator/          ← YOU CREATE THIS (Step 4) ❌
      index.ts          ← Semantic validation
      index.test.ts     ← Validation tests
    index.ts            ← Package entry ✅
  grammar/
    grammar.js          ← Grammar definition ✅
    tree-sitter-siren.wasm  ← WASM binary (7.8KB) ✅
    test/corpus/
      basic.txt         ← 8 passing corpus tests ✅
  test/
    fixtures/
      01-minimal.siren  ← Test inputs ✅
      02-simple.siren   ✅
      03-dependencies.siren ✅
    helpers/
      node-adapter.ts   ← Real tree-sitter adapter for tests ✅
      parser.ts         ← Test helper (getTestAdapter) ✅
    integration/
      node-adapter.test.ts  ← 11 adapter tests ✅
      fixtures.test.ts      ← 22 fixture tests ✅
```

### Apps (Not Started)
```
apps/web/
  src/parser/
    adapter.ts          ← YOU CREATE THIS (copy from test/helpers/node-adapter.ts) ❌
apps/cli/
  src/parser/
    adapter.ts      Real Adapter)
```typescript
import { getTestAdapter } from '../helpers/parser.js';
import { decode } from '../decoder/index.js';

test('decoder handles empty document', async () => {
  const adapter = await getTestAdapter();
  const result = await adapter.parse('');
  const decoded = decode(result.tree!);
  
  expect(decoded.success).toBe(true);
  expect(decoded.document?.resources).toHaveLength(0);
});
```

### Integration Tests (Same Pattern)
```typescript
import { getTestAdapter } from '../helpers/parser.js';
import { readFileSync } from 'node:fs';

test('parses fixture file', async () => {
  const adapter = await getTestAdapter();
  const source = readFileSync('test/fixtures/01-minimal.siren', 'utf-8');
  const result = await adapter.parse(source);
  
  expect(result.success).toBe(true);
  expect(result.tree?.resources).toHaveLength(4ee-sitter`
- Only pure TypeScript and interfaces

### 2. No `any` Types
- Use discriminated unions for variant types
- Use type guards for narrowing
- Make invalid states unrepresentable

### 3. Readonly Everything (IR)
- All IR types use `readonly` modifier
- Immutable data structures
- Transform → new object, don't mutate

### 4. Grammar WASM is Committed
- Apps bundle the .wasm file directly
- No C compiler required for consumers
- Regenerate only when grammar changes

### 5. CST ≠ IR
- CST: 1:1 with grammar, position info, error nodes
- IR: Semantic model, validated, clean types
- Decoder bridges them with validation

---

## Common Pitfalls

### ❌ Don't: Import tree-sitter in core
```typescript
// WRONG - breaks portability
import Parser from 'web-tree-sitter';
```

### ✅ Do: Use ParserAdapter
```typescript
// RIGHT - adapter injected by app
function parse(source: string, adapter: ParserAdapter) {
  return adapter.parse(source);
}
```

### ❌ Don't: Mutate IR
```typescript
// WRONG
const resource: Resource = ...;
resource.attributes.push(newAttr);
```

### ✅ Do: Transform immutably
```typescript
// RIGHT
const updated: Resource = {
  ...resource,
  attributes: [...resource.attributes, newAttr],
};
```

### ❌ Don't: Use `any` for CST nodes
```typescript
// WRONG
function walkNode(node: any) { ... }
```

### ✅ Do: Use discriminated unions and type narrowing
```typescript
// RIGHT - check node.type directly
function walkNode(node: CSTNode) {
  if (node.type === 'resource') {
    // TypeScript knows node is ResourceNode here
  }
}
// Note: Type guard functions (isResourceNode, etc.) will be added
// in the decoder when actually needed - classic YAGNI.
```

---

## Build Commands

### Grammar
```bash
cd packages/core/grammar
npx tree-sitter-cli generate      # Regenerate C parser
npx tree-sitter-cli build --wasm  # Rebuild WASM
npx tree-sitter-cli test          # Run corpus tests
```

### Core Tests
```bash
yarn workspace @siren/core test        # Unit tests
yarn workspace @siren/core test:watch  # Watch mode
```

### Parse a File (Manual Testing)
```bash
cd packages/core/grammar
npx tree-sitter-cli parse ../test/fixtures/01-minimal.siren
```

---

## Questions for Product/Design

Before implementing decoder, clarify:

1. **Validation strictness**: Should undefined references be errors or warnings?
2. **Forward references**: Are they allowed? (`task A { depends_on = B }` before `task B` is declared)
3. **Attribute schemas**: Is `depends_on` special, or are all attributes free-form?
4. **Duplicate IDs**: Error or last-wins?
5. **Mixed resource dependencies**: Can `task` depend on `milestone`? Vice versa?
6. **Circular dependencies**: Detect and reject, or allow?
7. **Duplicate attributes within resource**: `task T { x = 1 x = 2 }` - error, last-wins, or both kept?
8. **Null vs undefined**: Is `optional = null` different from omitting `optional`?

Current assumption: **Everything is permissive at parse time, validated semantically later.**

**⚠️ CRITICAL**: These must be answered **before Step 1 (decoder)** via test cases in Step 0.
Open Product Questions

The following need product/design decisions:

1. **Forward references**: Are they allowed? (`task A { depends_on = B }` before `task B` is declared)
2. **Duplicate IDs**: Error or last-wins? (`task X { } task X { }`)
3. **Mixed resource dependencies**: Can `task` depend on `milestone`? Vice versa?
4. **Undefined references**: Error or warning? (`depends_on = nonexistent`)
5. **Duplicate attributes**: Error, last-wins, or both kept? (`task T { x = 1 x = 2 }`)

**Decided behaviors** (see "Product Decisions" section above):
- ✅ Circular dependencies → warning (not error)
- ✅ Empty arrays → valid
- ✅ String literals → strip quotes
- ✅ All attributes are free-form (no schema enforcement yet)

**Recommendation**: Defer undecided behaviors to Step 4 (validation). Decoder can be permissive and just transform CST → IRent the decoder and wire up the adapters.
