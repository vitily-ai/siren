<!-- markdownlint-disable-file -->

# Task Details: Add CLI `siren format` Command

## Research Reference

**Source Research**: #file:../research/20260128-export-ir-research.md

## Phase 1: CLI Integration

### Task 1.1: Add command skeleton and wiring to exporter

Create a new command under `apps/cli/src/commands/format.ts` (or integrate into existing CLI command dispatch):

- Read list of `.siren` files (reuse `findSirenFiles` from `apps/cli/src/project.ts`).
- For each file: parse -> decode -> if `document` present, create `IRContext.fromResources(document.resources, source=filePath)` -> call `exportToSiren(ir)` -> compare & write.

- **Files**:
  - apps/cli/src/commands/format.ts - command handler
  - apps/cli/src/cli.ts or index.ts - wire command registration

- **Success**:
  - CLI runs `node ./apps/cli ... format` and formats files

### Task 1.2: Add dry-run and backup options

Command options:

- `--dry-run` - Show diffs/paths that would change without writing
- `--backup` - Create `.bak` backup before overwriting

Implement using synchronous `fs` methods for simplicity in the CLI.

### Task 1.3: Add integration tests (golden output)

- **Files**:
  - apps/cli/test/format.test.ts - integration test that runs `siren format` on sample fixtures
  - apps/cli/test/expected/ - golden files for formatted output

- **Success**:
  - Tests assert that files written match golden formatted output and decode round-trips remain semantically equal.

## Dependencies

- `@siren/core` exporter implemented and published to workspace (local workspace link)

## Success Criteria

- CLI `format` command available and functional
- `--dry-run` and `--backup` behave as expected
