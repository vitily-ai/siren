# Project fixtures

These directories are **copies** of the project fixtures at
`packages/core/test/fixtures/projects/`. They are duplicated (not symlinked)
because contributor environments and CI runners on Windows do not always
honor symlinks reliably.

The originals remain canonical: `apps/cli/test/helpers/fixture-utils.ts`
references them by hardcoded relative path until Phase 3.3 of the
language-package migration repoints the CLI to a shared location. Until
then, **edits to a fixture must be applied in both trees** (or the
duplication should be eliminated as part of the CLI migration).

If a fixture diverges between the two trees, treat it as a bug.
