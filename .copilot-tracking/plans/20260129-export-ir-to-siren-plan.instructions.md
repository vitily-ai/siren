---
applyTo: ".copilot-tracking/changes/20260129-export-ir-to-siren-changes.md"
---

<!-- markdownlint-disable-file -->

# Task Checklist: Export IR To Siren

## Overview

Add an environment-agnostic exporter in `packages/core` that converts the IR into Siren markup (string output).

## Objectives

- Produce `exportToSiren(ctx: IRContext): string` in core that emits deterministic Siren text.
- Add unit tests and golden fixtures validating round-trip stability.

## Research Summary

### Project Files

- packages/core/src/ir/context.ts - IRContext shape and factory
- packages/core/src/decoder/index.ts - per-file decode produces `Document`

### External References

- #file:../research/20260128-export-ir-research.md - research summary and recommended approach

## Implementation Checklist

### [ ] Phase 1: Exporter Implementation

- [ ] Task 1.1: Create exporter module and public API

  - Details: .copilot-tracking/details/20260129-export-ir-to-siren-details.md (Lines 1-200)

- [ ] Task 1.2: Implement formatting rules and helpers

  - Details: .copilot-tracking/details/20260129-export-ir-to-siren-details.md (Lines 1-200)

- [ ] Task 1.3: Add unit tests and fixtures

  - Details: .copilot-tracking/details/20260129-export-ir-to-siren-details.md (Lines 1-200)

## Dependencies

- Vitest in `packages/core` (existing)
- No runtime dependencies

## Success Criteria

- `exportToSiren` returns stable textual output for a given `IRContext`.
- Tests verifying round-trip decode -> export maintain semantics pass.
