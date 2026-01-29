---
applyTo: ".copilot-tracking/changes/20260129-add-cli-format-command-changes.md"
---

<!-- markdownlint-disable-file -->

# Task Checklist: Add CLI `siren format` Command

## Overview

Implement a CLI command that applies the exporter to each `.siren` file and writes formatted output back to the file system.

## Objectives

- Add `format` command to `apps/cli` that reads `.siren` files, decodes them, exports using core exporter, and writes output.
- Ensure CLI preserves semantics (no resource changes) and offers a dry-run mode.

## Research Summary

- The CLI can access per-file decode results during loading (see `apps/cli/src/project.ts`).
- Use exporter via `IRContext.fromResources(document.resources, source=filePath)` per-file.

## Implementation Checklist

### [ ] Phase 1: CLI Integration

- [ ] Task 1.1: Add command skeleton and wiring to exporter

  - Details: .copilot-tracking/details/20260129-add-cli-format-command-details.md (Lines 1-200)

- [ ] Task 1.2: Add dry-run and backup options

  - Details: .copilot-tracking/details/20260129-add-cli-format-command-details.md (Lines 1-200)

- [ ] Task 1.3: Add integration tests (golden output)

  - Details: .copilot-tracking/details/20260129-add-cli-format-command-details.md (Lines 1-200)

## Dependencies

- New exporter in `@siren/core`
- Node `fs` access in CLI (existing)

## Success Criteria

- `siren format` writes formatted files with unchanged semantics.
- `siren format --dry-run` prints proposed changes without writing.
