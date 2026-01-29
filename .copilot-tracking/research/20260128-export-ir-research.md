
<!-- markdownlint-disable-file -->

# Task Research Notes: Exporting IR to Siren Markup

## Research Executed

### File Analysis

- packages/core/src/ir/context.ts
  - `IRContext` is an immutable, thin wrapper around a `Document` (resources, optional source, cycles).
  - Exposes a small set of utility/query methods (`findResourceById`, `getMilestoneIds`, `getTasksByMilestone`, `getIncompleteLeafDependencyChains`).
  - Construction via `IRContext.fromResources(resources, source?)` exists and is intentionally minimal.

- packages/core/src/ir/types.ts
  - IR `Resource` objects are plain data: `type`, `id`, `complete`, `attributes`.
  - `Document` contains `resources`, optional `source`, and `cycles`.

- packages/core/src/decoder/index.ts
  - `decode(cst)` produces a `Document` with `resources` in the same order as the CST resources.
  - Decoder does not attach per-resource source/file metadata to `Resource` objects.

- packages/core/src/index.ts
  - Core public surface exports `decode` and IR types + `IRContext`.
  - Design goal: core is environment-agnostic and exposes `IRContext` as the documented API.

- apps/cli/src/project.ts
  - CLI currently iterates files, parses each, decodes each file into a `Document`, and collects `resources` into a single aggregated `IRContext`.
  - During file processing the CLI has access to per-file `decodeResult.document` and the original `filePath` (so the CLI can create per-file contexts before aggregation).

- CONTRIBUTING.md (Public API Policy - IRContext)
  - Project policy prefers a minimal, opaque `IRContext` and keeping internal utilities private.
  - When a capability is intended for consumers, add a well-documented method to `IRContext`.

### Code Search Results

- "IRContext"
  - Found usages in `packages/core/src/index.test.ts`, `apps/cli/src/project.ts`, and core public index export.
- "decode(cst)"
  - Decoder returns `Document` objects; resources are decoded in CST order.
- "export" or "printer"
  - No existing Siren text-emission/printer module found in `packages/core`.

### External Research

- #githubRepo:"prettier/prettier printing architecture"
  - Prettier separates parsing and printing into distinct modules: parsers produce an AST/CST, then a dedicated printer/formatter module converts it to string output. Printers are language-specific, pluggable, and operate on AST/CST without mutating it. Search results show `printer-*` modules and a centralized `parser-and-printer` orchestrator.
- #fetch:https://refactoring.guru/design-patterns/visitor
  - The Visitor pattern is described as a way to separate algorithms (e.g., exporting/printing) from the object model, avoiding embedding many format-specific methods on domain objects.
- #fetch:https://en.wikipedia.org/wiki/Single-responsibility_principle
  - The Single Responsibility Principle (SRP) argues that formatting/serialization is a distinct reason to change and should be separated from domain model responsibilities.

## Key Discoveries

### Project Structure

The core library intentionally exposes a compact `IRContext` API and plain IR types. The CLI has access to per-file decode results during loading but currently aggregates resources into a single `IRContext` for programmatic queries.

### Implementation Patterns

- In mature formatters (Prettier) the printing/formatting logic lives in separate modules that consume an AST/CST; printers are independent from the parser and from domain model internals.
- Design principles (SRP, Visitor) favor keeping serialization/printing concerns separate from the domain objects when those behaviors are not intrinsic domain responsibilities.

### Complete Examples

```typescript
// Example exporter API (recommended)
import { IRContext } from '@siren/core';

export function exportToSiren(ctx: IRContext): string {
  // iterate ctx.resources (immutable plain data) and produce a formatted siren string
}
```

### API and Schema Documentation

- Inputs available for an exporter:
  - `IRContext.resources` — ordered, immutable Resource[]
  - `Resource` shape: `{ type, id, complete, attributes[] }`
  - Decoder produces `Document` per-file before aggregation, so file-scoped export is possible at the CLI layer.

### Configuration Examples

```json
// CLI: format flow (high-level)
{
  "for each file": [
    "parse source -> cst",
    "decode(cst) -> document",
    "ir = IRContext.fromResources(document.resources, source=filePath)",
    "out = exporter.exportToSiren(ir)",
    "write out back to file"
  ]
}
```

### Technical Requirements

- Export must be environment-agnostic (produce in-memory string/buffer). Writing to disk is the caller's responsibility (CLI/web decide how to persist).
- Export should preserve structural semantics; format may be opinionated (ordering, spacing) but must not change the project semantics.
- To implement a `siren format` command without large core changes, the CLI should perform per-file decode → per-file IRContext → exporter → write back.

## Recommended Approach

Selected approach: Independent exporter modules that accept `IRContext` (or `Document`) and produce an in-memory string/buffer.

Rationale (evidence-based):
- Respects Single Responsibility Principle and existing core portability goals: core remains focused on parsing/IR and provides plain data; serialization lives in a separate module.
- Matches proven practice in formatters (Prettier): separate printer/formatter layer that operates on immutable AST/IR.
- Minimal API surface change to `IRContext` — keeps the public API stable in line with `CONTRIBUTING.md` and avoids expanding `IRContext` responsibilities prematurely.
- Enables the CLI to implement `siren format` by using the per-file `Document` produced during decode and creating a per-file `IRContext.fromResources(document.resources, source)`, which the exporter consumes. This preserves original per-file ordering and allows deterministic output.

## Implementation Guidance

- Objectives: implement an environment-agnostic, testable exporter for Siren markup that emits an opinionated, stable textual format from the IR.
- Key Tasks:
  1. Add a new module in core: `packages/core/src/export/project-exporter.ts` (or `exporter/siren.ts`) that exports `exportToSiren(ctx: IRContext): string` and small helpers for attribute printing.
  2. Implement canonical formatting rules (indentation, attribute ordering, array formatting). Use `ctx.resources` order as the canonical order for output.
  3. Add unit tests under `packages/core/test/fixtures/snippets/` demonstrating round-trip examples: parse -> decode -> export -> parse (optionally) or string comparison to golden fixtures.
  4. Update CLI: add `siren format` command that, for each file, parses & decodes, constructs `IRContext.fromResources(document.resources, source=filePath)`, calls `exportToSiren`, and writes output back to the same file (after a safety check/backups). The CLI should preserve file-level behavior (preserve source file list and warnings).
  5. Document the exporter API in core README and update `CONTRIBUTING.md` to note exporter conventions.

- Dependencies:
  - No runtime dependencies required; pure TypeScript string emission.
  - Tests: vitest additions in `packages/core` using existing test harness.

- Success Criteria:
  - `exportToSiren` produces deterministic, stable output for the same IR.
  - `siren format` applied to a repo with `.siren` files only changes whitespace/formatting, not semantics (verified by a decode round-trip and comparing resource identity and attributes).
  - Core public API (`IRContext`) remains unchanged for consumers who do not import the exporter.

## Example CLI snippet (concise)

```typescript
// in apps/cli/src/commands/format.ts
import { getParser } from '../parser.js';
import { exportToSiren } from '@siren/core/exporter';
import { IRContext } from '@siren/core';

const parser = await getParser();
const source = fs.readFileSync(filePath, 'utf-8');
const parseResult = await parser.parse(source);
const decoded = decode(parseResult.tree);
if (!decoded.document) return;
const perFileIr = IRContext.fromResources(decoded.document.resources, filePath);
const out = exportToSiren(perFileIr);
fs.writeFileSync(filePath, out, 'utf-8');
```

Notes:
- If later we want a convenience `ir.exportToProject()` we can add that surface (thin wrapper calling the standalone exporter). Start with decoupled exporter to keep core API minimal.
- Future exporters (Mermaid, JSON, YAML) should follow the same pattern and be colocated under `packages/core/src/export/` so they can be reused by CLI/web while remaining environment-agnostic.
