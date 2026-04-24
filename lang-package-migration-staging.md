# Language Package Migration — Staging Doc

This file tracks working code removed from `@sirenpm/core` during Release 1 that must be re-introduced in later releases. See `lang-package-plan.md` for context. Delete this file at the end of Release 4.

## Release 2 port targets

_Populated during Release 1 Phase 1.3 and 1.4._

**`Origin` canonical location (Phase 1.2):** `Origin` now lives in `packages/core/src/ir/types.ts`. When Phase 2.2 restores `packages/language/src/parser/cst.ts`, its `Origin` import must resolve to `@sirenpm/core`, not a local redeclaration.

## Release 3 port targets

_Populated during Release 1 Phase 1.3._
