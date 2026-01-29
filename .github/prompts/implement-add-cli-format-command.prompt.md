---

---

<!-- markdownlint-disable-file -->

# Implementation Prompt: Add CLI `siren format` Command

## Implementation Instructions

### Step 1: Create Changes Tracking File

You WILL create `.copilot-tracking/changes/20260129-add-cli-format-command-changes.md` if it does not exist.

### Step 2: Execute Implementation

You WILL implement the CLI handler in `apps/cli/src/commands/format.ts` and wire it into the CLI dispatcher.

You WILL:

- Reuse parsing and decoding logic from `apps/cli/src/project.ts`.
- For each file, construct `IRContext.fromResources(document.resources, source=filePath)` and call `exportToSiren` from `@siren/core`.
- Implement `--dry-run` and `--backup` flags.
- Add integration tests in `apps/cli/test/` that verify formatted output and decode round-trip.

**CRITICAL**: The CLI should not modify semantics; validate each file's exported result decodes to equivalent IR before overwriting.

### Step 3: Cleanup

When done, record changes in the changes tracking file and remove this prompt if appropriate.

## Success Criteria

- Changes tracking file created
- CLI command implemented and tested
