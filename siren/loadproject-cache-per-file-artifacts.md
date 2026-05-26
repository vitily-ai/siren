`loadProject` parses and decodes all .siren files at startup but only retains
the merged IRContext + diagnostics on ProjectContext. Per-file parse trees,
comments (SourceIndex), and per-file IRContexts are discarded.

Commands that need per-file artifacts (currently `format`, likely future
`lint`, `lsp`, etc.) re-parse each file from disk. `runFormat` in
apps/cli/src/commands/format.ts re-parses every file just to recover the
per-file tree + comments needed for exportWithComments and the round-trip
semantic check.

Cache per-file { tree, comments, ir } on ProjectContext (keyed by file path)
so frontends can reuse the startup parse instead of re-parsing.