Summary of changes for Export IR → Siren

- Added an environment-agnostic exporter that converts an `IRContext` to a
  Siren-formatted string.
- New files:
  - packages/core/src/export/siren-exporter.ts
  - packages/core/src/export/formatters.ts
  - packages/core/src/export/index.ts
  - packages/core/src/exporter.test.ts
- Updated public API to re-export the export helpers from `packages/core/src/index.ts`.

Files touched:
- [packages/core/src/export/siren-exporter.ts](packages/core/src/export/siren-exporter.ts)
- [packages/core/src/export/formatters.ts](packages/core/src/export/formatters.ts)
- [packages/core/src/export/index.ts](packages/core/src/export/index.ts)
- [packages/core/src/exporter.test.ts](packages/core/src/exporter.test.ts)
- [packages/core/src/index.ts](packages/core/src/index.ts)

Notes:
- The exporter is pure and returns a string; CLI/file writes are intentionally
  left to the CLI layer.
