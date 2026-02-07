---
description: "Standardized Siren test fixtures layout and naming conventions"
name: "Siren fixtures"
applyTo: "packages/core/test/fixtures/projects/**"
---

# Siren test fixtures — project-wide conventions

These instructions document the canonical layout and naming conventions used
for the test fixtures under `packages/core/test/fixtures/projects/`.

- Layout: each fixture is a folder under `packages/core/test/fixtures/projects/`.
- Do NOT place a nested `siren/` directory inside a fixture. Fixture files live
  directly under the fixture folder (subdirectories are allowed for nested
  files).
- Main fixture file: if a fixture previously used `main.siren`, rename that
  file to match the fixture folder name. Example: the `dangling-dependencies`
  fixture should contain `dangling-dependencies.siren` as its primary file.
- Additional `.siren` files in the fixture folder or its subfolders are
  allowed; keep names descriptive and unique within the fixture.
- File extensions: use the `.siren` extension for all files intended to be
  parsed by the Siren parser.
- Diagnostics and golden tests: tests and golden outputs should reference the
  fixture file names exactly as they exist in the fixture (e.g.
  `circular-depends.siren` or `deep-nested/a/level1.siren`). When CLI tests
  copy fixture contents into a temporary `siren/` directory (as the test
  harness does), CLI-facing output may be prefixed with `siren/`; keep that
  prefix only in golden expectations that reflect CLI output.

Guidance for authors and tools

- Prefer using the `yarn create-fixture` script in the root `package.json` to generate new fixtures, as it  will follow these conventions automatically. 
- When creating a new fixture, place files under
  `packages/core/test/fixtures/projects/<fixture-name>/`.
- Ensure the primary file is named `<fixture-name>.siren` if the scenario has a
  single top-level file. For multi-file fixtures, choose clear names and
  document intent in a README inside the fixture if useful.
- Keep fixture contents parseable by the tree-sitter grammar used by the
  project; include broken/invalid fixtures only when the test scenario
  intentionally asserts parse errors.
- If you need to update existing fixtures (rename or move files), update any
  tests or golden expectations that reference those files.

Notes for AI assistants and bots

- When asked to create or modify fixtures, follow these rules exactly — do not
  reintroduce a nested `siren/` folder or `main.siren` as the canonical
  primary filename.
- Use Markdown links to reference files or tests when providing instructions or
  examples, and use workspace-relative paths.
