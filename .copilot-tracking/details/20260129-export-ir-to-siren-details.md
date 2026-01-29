<!-- markdownlint-disable-file -->

# Task Details: Export IR To Siren

## Research Reference

**Source Research**: #file:../research/20260128-export-ir-research.md

## Phase 1: Exporter Implementation

### Task 1.1: Create exporter module and public API

Create `packages/core/src/export/siren-exporter.ts` with a public function:

- `export function exportToSiren(ctx: IRContext): string`

- **Files**:
  - packages/core/src/export/siren-exporter.ts - exporter implementation and helpers
  - packages/core/src/export/index.ts - re-export

- **Success**:
  - Module compiles in `packages/core`'s TypeScript build
  - Function is exported from `packages/core/src/index.ts` (or `export/*` barrel)

- **Research References**:
  - #file:../research/20260128-export-ir-research.md (Lines 1-200) - design rationale

### Task 1.2: Implement formatting rules and helpers

Implement opinionated formatting rules:

- Resource ordering: use `ctx.resources` order
- Resource block format: `<type> <id> [complete] {\n  key = value\n}` with consistent indentation
- Attribute formatting: primitives as literals, arrays in `[a, b]` form, references as bare identifiers

- **Files**:
  - packages/core/src/export/formatters.ts - helpers for attribute rendering

- **Success**:
  - Output matches golden formatting for sample fixtures

### Task 1.3: Add unit tests and fixtures

- **Files**:
  - packages/core/test/fixtures/snippets/export-roundtrip.siren (example input)
  - packages/core/test/exporter.test.ts (unit tests using vitest)

- **Success**:
  - Tests verify decode(document) -> IRContext -> exportToSiren -> parsing the output yields equivalent IR (structure and attributes)

## Dependencies

- Vitest (existing test environment in `packages/core`)

## Success Criteria

- `exportToSiren` returns deterministic, stable text for the same input IR.
- Tests cover primitive, array, reference, and `complete` keyword cases.
