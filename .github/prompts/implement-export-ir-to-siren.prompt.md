---
model: GPT-5 mini (copilot)
name: Implement Export IR To Siren
---

<!-- markdownlint-disable-file -->

# Implementation Prompt: Export IR To Siren

## Implementation Instructions

### Step 1: Create Changes Tracking File

You WILL create `.copilot-tracking/changes/20260129-export-ir-to-siren-changes.md` if it does not exist.

### Step 2: Execute Implementation

You WILL implement the exporter in `packages/core/src/export/siren-exporter.ts` following the details in `.copilot-tracking/details/20260129-export-ir-to-siren-details.md`.

You WILL:

- Export `exportToSiren(ctx: IRContext): string` from the new module.
- Add `packages/core/src/export/index.ts` as a re-export barrel and update `packages/core/src/index.ts` to export the new module from the public API if desired.
- Add formatting helpers in `formatters.ts` and unit tests under `packages/core/test/`.

**CRITICAL**: The exporter must be environment-agnostic and return an in-memory string; file writes belong to the CLI.

### Step 3: Cleanup

After completing implementation and tests, update `.copilot-tracking/changes/20260129-export-ir-to-siren-changes.md` with a short summary and file links, then remove this prompt file if appropriate.

## Success Criteria

- Changes tracking file created
- `exportToSiren` implemented and tested
- Tests pass locally in `packages/core`
