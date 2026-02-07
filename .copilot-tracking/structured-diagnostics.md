# Structured Diagnostics Implementation

**Status:** Core implementation complete ✅ | CLI integration pending ⏳

**Date:** February 6, 2026

---

## Overview

Core diagnostics have been refactored from preassembled message strings to structured data. This separates the concerns of **data** (what happened) from **presentation** (how to display it), allowing frontends (CLI, web) to make their own UX decisions about formatting, localization, and presentation style.

## What Changed

### Core (`packages/core`)

#### 1. Diagnostic Type Structure

**Before:**
```typescript
interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string; // Preassembled string with file paths, etc.
}
```

**After:** Discriminated union with code-specific structured fields
```typescript
type Diagnostic = 
  | DanglingDependencyDiagnostic 
  | CircularDependencyDiagnostic
  | BaseDiagnostic;

interface DanglingDependencyDiagnostic {
  code: 'W005';
  severity: 'warning';
  resourceId: string;        // NEW: ID of resource with dangling dep
  resourceType: ResourceType; // NEW: 'task' | 'milestone'
  dependencyId: string;      // NEW: ID of missing dependency
  file?: string;             // NEW: File path (when available)
  line?: number;             // NEW: Line number (when from parsed files)
  column?: number;           // NEW: Column number (when from parsed files)
}

interface CircularDependencyDiagnostic {
  code: 'W004';
  severity: 'warning';
  nodes: string[];           // NEW: Cycle chain ['a', 'b', 'c', 'a']
  file?: string;             // NEW: File path (when available)
  line?: number;             // NEW: Line number (when from parsed files)
  column?: number;           // NEW: Column number (when from parsed files)
}
```

#### 2. Modified Files

- **`packages/core/src/ir/context.ts`**
  - Updated `Diagnostic` type to discriminated union
  - Modified `computeDanglingDiagnostics()` to populate structured fields
  - Modified `computeDiagnostics()` to populate structured fields for cycles
  - Extracts position info from `Resource.origin` when available
  - File attribution from `resourceSources` map when provided

#### 3. Test Coverage

**New unit tests** (`packages/core/src/ir/context.test.ts`):
- 8 tests covering diagnostics with and without file attribution
- Tests IR construction via `IRContext.fromResources()` (no CST)
- Validates structured fields are present/absent appropriately

**Updated integration tests:**
- `packages/core/test/integration/projects/dangling-dependencies.test.ts`
- `packages/core/test/integration/projects/circular-depends.test.ts`
- `packages/core/test/integration/projects/overlapping-cycles.test.ts`

All tests now assert on **structured fields** instead of message strings:
- ✅ 258 core tests passing
- ✅ Tests prescribe exact contract for diagnostic structure

#### 4. Decoder Tests

**Updated** (`packages/core/src/decoder/index.test.ts`):
- Removed message content assertions for W001, W002, W003, E001
- Now only check `code` and `severity` (structured fields)
- Parse-level diagnostics remain simpler (not part of IR semantic analysis)

---

## What Needs To Be Done

### CLI (`apps/cli`)

**Status:** ⚠️ Reverted due to type errors

The CLI currently expects the old `Diagnostic` interface with `message` strings. It needs to be updated to:

1. **Handle discriminated union diagnostics**
   - Type guard or switch on `diagnostic.code`
   - Format messages based on diagnostic type

2. **Format W005 (Dangling Dependency) messages**
   ```typescript
   // Example formatting:
   function formatDanglingDiag(diag: DanglingDependencyDiagnostic): string {
     const filePrefix = diag.file ? `${diag.file}:` : '';
     const position = diag.line ? `:${diag.line}:${diag.column}` : '';
     return `${filePrefix}${position} Dangling dependency: ${diag.resourceType} '${diag.resourceId}' -> ${diag.dependencyId}?`;
   }
   ```

3. **Format W004 (Circular Dependency) messages**
   ```typescript
   function formatCycleDiag(diag: CircularDependencyDiagnostic): string {
     const filePrefix = diag.file ? `${diag.file}:` : '';
     const position = diag.line ? `:${diag.line}:${diag.column}` : '';
     const cyclePath = diag.nodes.join(' -> ');
     return `${filePrefix}${position} Circular dependency detected: ${cyclePath}`;
   }
   ```

4. **Update affected files**
   - `apps/cli/src/project.ts` - Where diagnostics are displayed
   - Add helper functions for diagnostic formatting
   - Consider creating a `diagnostics.ts` module for formatting logic

### Web App (`apps/web`)

**Status:** Not yet addressed

Similar changes needed for web frontend:
- Update to handle new diagnostic structure
- Design UX for presenting structured diagnostic data
- Could present as structured list, tree view, or custom visualization

---

## Migration Guide for Frontends

### Before (message strings):
```typescript
for (const diag of diagnostics) {
  console.error(`${diag.severity}: ${diag.message}`);
}
```

### After (structured data):
```typescript
for (const diag of diagnostics) {
  const formatted = formatDiagnostic(diag);
  console.error(`${diag.severity}: ${formatted}`);
}

function formatDiagnostic(diag: Diagnostic): string {
  switch (diag.code) {
    case 'W005': {
      const d = diag as DanglingDependencyDiagnostic;
      return `${d.file || ''}:${d.line || 0}:${d.column || 0} Dangling dependency: ${d.resourceType} '${d.resourceId}' -> ${d.dependencyId}?`;
    }
    case 'W004': {
      const d = diag as CircularDependencyDiagnostic;
      return `${d.file || ''}:${d.line || 0}:${d.column || 0} Circular dependency: ${d.nodes.join(' -> ')}`;
    }
    default:
      return diag.message || 'Unknown diagnostic';
  }
}
```

---

## Benefits

1. **Separation of concerns** - Core provides data, frontends decide presentation
2. **Localization ready** - Frontends can translate based on structured fields
3. **Flexible UX** - Different frontends can present diagnostics differently
4. **Better testing** - Tests assert on semantic data, not string formatting
5. **Position info** - Line/column numbers available when diagnostics come from parsed files
6. **Type safety** - Discriminated unions provide compile-time guarantees

---

## Testing Strategy

### Core Tests
All tests assert on structured fields:
- `diagnostic.code` - error/warning code
- `diagnostic.severity` - severity level
- Type-specific fields (`resourceId`, `nodes`, etc.)
- Position info (`file`, `line`, `column`) when applicable

**DO NOT** assert on `message` content - that's a frontend concern.

### Frontend Tests
Should test:
- Diagnostic formatting logic
- Different presentation modes
- Edge cases (missing position info, etc.)

---

## Related Work

- **Issue codes defined:**
  - `W004` - Circular dependency
  - `W005` - Dangling dependency
  - `W001`, `W002`, `W003` - Decoder warnings
  - `E001` - Decoder errors

- **Future diagnostic types** can extend the discriminated union following the same pattern

---

## Next Steps

1. ✅ Core implementation complete
2. ⏳ Update CLI to handle new diagnostic structure
3. ⏳ Update web app to handle new diagnostic structure
4. ⏳ Add golden tests in CLI to lock in formatting decisions
5. ⏳ Consider adding diagnostic formatting helpers to core (optional)

---

## Notes

- Parse-level diagnostics (`ParseDiagnostic` in decoder) remain simpler - they may get the same treatment in a future pass
- The `message` field still exists on `BaseDiagnostic` for backward compatibility with simple diagnostics, but W004/W005 no longer use it
- Position info extraction relies on `Resource.origin` field being populated during parsing
- IR constructed via `fromResources()` (without CST) won't have position info, only via `fromCst()`
