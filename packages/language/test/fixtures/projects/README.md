# Project fixtures

This is the **single canonical location** for Siren project test fixtures.

These fixtures are consumed by:
- **Language package** — integration tests in `packages/language/test/integration/` parse them through the real tree-sitter parser
- **CLI** — golden-file tests copy them via `copyProjectFixture()` from `apps/cli/test/helpers/fixture-utils.ts`
