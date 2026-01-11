# Siren - Copilot Instructions

## Project Overview
Siren is a "Project Management as Code" (PMaC) framework for defining projects as discrete atomic milestones using an HCL-inspired grammar. Text-based project definitions live alongside code in version control.

## Architecture
- **Core library** (`packages/core`): Environment-agnostic TypeScript - parsing, decoding, semantic validation, Mermaid emission. No DOM or Node dependencies.
- **Parser**: Tree-sitter WASM with adapters for browser/Node. Hide environment-specific loading behind interfaces.
- **IR Layer**: Resources parse into intermediate representation supporting multiple backends
- **Web app**: Vite-based browser app, imports core via workspace linkage
- **CLI**: Node CLI built with tsup/esbuild, shares core library

## Monorepo Structure
```
packages/
  core/       # parsing, validation, IR, Mermaid emission (env-agnostic)
apps/
  web/        # Vite browser app
  cli/        # Node CLI (tsup/esbuild)
```

## Runtime & Tooling
- **Node.js 24** + **Yarn 4** (Berry) with workspaces
- **TypeScript** throughout the monorepo
- Use `yarn workspace <name> <cmd>` for package-specific commands
- Root `package.json` orchestrates cross-package scripts

## Key Development Rules
1. **Core stays portable**: No DOM or Node APIs in `packages/core` - must run in both environments
2. **No pre-building core**: Apps compile core as part of their own build; only build core artifacts when publishing standalone
3. **Tree-sitter adapters**: Browser and Node loading hidden behind interface - core logic stays testable
4. **Workspace linking**: Import core as source via pnpm/yarn/npm workspaces, not as pre-built package

## Testing
- **Vitest** repo-wide for unit tests
- Per-package environments: `node` for core/CLI, `jsdom` for web
- **Playwright** only for browser E2E tests requiring real WASM loading

## Design Principles
- **Error tolerance**: Grammar must be recoverable and composable, not fail on first error
- **JIT rendering**: Changes reflect immediately without separate compilation
- **Self-bootstrapping**: Project defines its own milestones using Siren format
- **LM-agent friendly**: Optimize for context efficiency when used by autonomous agents

## License
GPL-3.0 for open source. Web app as hosted service avoids copyleft; separate commercial license for distributed/embedded enterprise deployments.
