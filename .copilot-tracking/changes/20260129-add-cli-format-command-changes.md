Summary of changes for CLI `siren format` command

- Added `siren format` command handler to the CLI to format .siren files.
- New files:
  - apps/cli/src/commands/format.ts
  - apps/cli/test/expected/format-multiple-files.txt
- Wired the command into `apps/cli/src/index.ts` dispatcher.

Behavior:
- Supports `--dry-run` (print formatted output) and `--backup` (write .bak file before overwrite).
- For each file, the CLI parses and decodes the original file, exports using `exportToSiren`,
  re-parses and decodes the exported text, and verifies the decoded IR matches the original before writing.
