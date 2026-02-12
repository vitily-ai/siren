# AGENTS.md

## Project Overview

Siren is a "Project Management as Code" (PMaC) framework that models projects as small, versioned artifacts using an HCL-inspired grammar. The repo is a TypeScript monorepo containing a portable `packages/core` library (parsing, decoding, IR, Mermaid emission), a `cli` app, and a small web app. Key tooling includes Yarn 4 workspaces, TypeScript, and Vitest for tests.

This AGENTS.md is written to onboard an automated code agent that will act as an expert in programming language design (PLD). The agent's role is to work on grammar, parser, IR, type systems, semantics, and test coverage while respecting the repo's portability and testing conventions.

## Agent Role: Programming Language Design Expert

- Primary goal: evolve and maintain Siren's language, parser, IR, and semantics so the project remains robust, extensible, and well-tested.
- Typical responsibilities:
  - Propose and implement grammar changes (syntax, keywords, quoting rules).
  - Update the Tree-sitter grammar and any adapter code.
  - Adjust CST → IR decoding and IR types to reflect semantic changes.
  - Design or refine semantic checks (validation, dependency analysis, error messages).
  - Add, update, and run tests and grammar fixtures demonstrating changes.
  - Ensure `packages/core` remains environment-agnostic (no DOM/Node-specific APIs).

## Scope & Permissions

- Allowed: modify files under `packages/core`, `apps/cli` tests/golden fixtures, grammar files, and repository-level docs.
- Avoid: changing CI config, licensing, or unrelated apps (e.g., large web UI overhauls) without explicit human approval.

## High-Value Targets (where to focus)

- Grammar: `packages/core/grammar/` and `packages/core/grammar/src/` (Tree-sitter DSL and parser artifacts).
- Parser & CST: `packages/core/src/parser/` and related adapter code.
- Decoder & IR: `packages/core/src/decoder/` and `packages/core/src/ir/`.
- Utilities: `packages/core/src/utilities/` (dependency-tree, entry, etc.).
- Tests & fixtures: `packages/core/test/fixtures/`, `apps/cli/test/expected/`, and `packages/core/test/`.

## Setup Commands (copyable)

Run from the repository root.

Install dependencies:

```
yarn
```

Run tests for a workspace package (replace `<package-name>` with the package name from its `package.json`):

```
yarn workspace <package-name> test
```

Run the whole repo test suite (if configured):

```
yarn test
```

If a package exposes a script (e.g. `vitest` or `test`), prefer using that script. Check `package.json` in each package for exact script names.

## Development Workflow & Conventions

- Branches: use short descriptive names (e.g., `pld/extend-grammar-attributes`).
- When changing `packages/core` grammar or decoding behavior, add a fixture under `packages/core/test/fixtures/` demonstrating the new or changed syntax.
- For CLI behavior changes or output formatting, add/adjust golden files under `apps/cli/test/expected/` and update `apps/cli/test/golden.test.ts` expectations.
- Keep `packages/core` portable: do not add Node-only or DOM-only APIs to core. If native APIs are required, add adapters and keep core logic abstracted.

## Testing Instructions

- Unit tests: use Vitest. Run package tests with `yarn workspace <package-name> test`.
- Integration/golden tests: update fixtures / expected files and run the corresponding package tests.
- When changing the grammar or IR, add at least one fixture that demonstrates the expected textual input and an accompanying test that asserts the decoded IR or CLI output.

## Code Style & Guidelines

- Language: TypeScript (strict typing encouraged).
- Keep changes minimal and focused: small PRs with a single, reviewable purpose.
- Follow existing naming and file organization patterns in `packages/core/src/`.
- Do not introduce one-off build steps or prebuilt core artifacts; core must be source-importable by apps.

## Build & Deployment

- This repo is not an application deployment target; focus on library correctness and tests.
- Build steps are package-local and driven by package scripts. Use Yarn workspace commands to run builds/tests per-package.

## Pull Request Guidance

- PR title format suggestion: `[pld] Short description` or `[packages/core] Short description`.
- Include tests and fixtures that validate behavior changes.
- Describe any grammar or IR changes in the PR description and link to examples/fixtures.

## Example Tasks You May Perform

- Add a new expression or declaration syntax to the grammar and wire it through CST → IR → CLI display.
- Design a static check that finds circular dependencies and add clear diagnostics and tests.
- Refactor IR types to better represent milestone/task relationships and update decoders and tests accordingly.

## Constraints & Safety

- Preserve existing public APIs unless a migration plan and tests are provided.
- Avoid adding large, unreviewed third-party dependencies; propose them in the PR description.

## Debugging & Troubleshooting

- Run package tests after changes. If tests fail, run the failing tests locally with Vitest in `--run`/`--watch` mode to iterate quickly.
- Use existing fixtures to reproduce issues. Add minimal failing examples when opening issues or PRs.

## Contact & Next Steps

If you (the human reviewer) want me to proceed, I can:

- Run the test suite and report failures.
- Open a draft PR with an implemented grammar change and associated fixtures.

---

This AGENTS.md is intentionally agent-focused: it lists exact files and commands to execute, rules to follow, and the kinds of tasks the Programming Language Design expert should perform.
