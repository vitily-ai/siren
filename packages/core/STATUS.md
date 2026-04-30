# `@sirenpm/core` Status

`@sirenpm/core` is the environment-agnostic foundation of the Siren toolchain. It contains the IR types, semantic validation, the `IRExporter` interface, the `DiagnosticBase` shape, and shared utilities. It has **no** parser, decoder, or exporter implementations — those live in [`@sirenpm/language`](../language/).

## Public surface

- **IR types** (`src/ir/types.ts`): `Document`, `Resource`, `Task`, `Milestone`, `Attribute`, `AttributeValue`, `Origin`, plus type guards.
- **`IRAssembly`** (`src/ir/assembly.ts`): **canonical** raw resource accumulation path. Preserves caller order, including duplicates, and builds an immutable `IRContext` through `assembly.build()`.
- **`IRContext`** (`src/ir/context.ts`): **immutable built semantic snapshot**. Contains resolved resources (deduplication + implicit milestone completion), dependency cycles, grouped diagnostics, and aggregate diagnostics. `IRContext.diagnostics` provides the **full semantic diagnostic snapshot** for that context (W001/W002/W003), not a delta. **Deprecated but functional**: `IRContext.fromResources(resources, source?)` and `new IRContext(doc)` remain as compatibility construction paths; prefer `IRAssembly` for new code. Removal deferred to future major version.
- **Semantic diagnostics** (`src/ir/diagnostics.ts`, `src/ir/analysis.ts`): `CircularDependencyDiagnostic` (W001), `DanglingDependencyDiagnostic` (W002), `DuplicateIdDiagnostic` (W003). All extend `DiagnosticBase`; analysis preserves ordering as cycles, dangling dependencies, then duplicates.
- **`DiagnosticBase`** (`src/ir/diagnostics.ts`): structural shape `{ code, severity, file?, line?, column? }` with no `message`. Frontends assemble display text from structured fields.
- **`IRExporter`** (`src/ir/exporter.ts`): `interface IRExporter { export(ctx: IRContext): string }`. Implemented in `@sirenpm/language` (e.g. `SirenExporter`).
- **Utilities** (`src/utilities/`): `DependencyTree`, milestone helpers, entry/graph helpers — usable across all frontends.

## Constraints

- **Environment-agnostic**: no DOM or Node APIs; the bundle runs in browser and Node hosts.
- **No parser/decoder/export code**: those concerns live in `@sirenpm/language`.
- **Bundled output**: tsup emits a single ESM module (`dist/index.js`) plus types (`dist/index.d.ts`).

## Consumers

- `@sirenpm/language` (`packages/language/`) — owns the tree-sitter grammar, parser factory, decoder (CST → IR), comment classification, exporters, and formatters. Depends on `@sirenpm/core` as a peer.
- `@sirenpm/cli` (`apps/cli/`) — depends on both `@sirenpm/core` and `@sirenpm/language` via npm pins.
- `apps/web/` — currently depends on `@sirenpm/core` only; will add `@sirenpm/language` when in-browser parsing lands.

## Testing

Vitest, Node environment. Tests cover IR types, `IRContext` behavior, semantic diagnostics, and utilities. There are no parse/decode tests in this package — those live in `@sirenpm/language`.

```
yarn workspace @sirenpm/core test
```
