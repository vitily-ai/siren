---
"@sirenpm/core": minor
---

Rename `Resource` → `SirenEntry` across the public IR and builder surface.

The conceptual term "resource" (any value or structure tracked in a Project)
remains a conventional / documentation term, but is no longer present in the
code. The exported type is now `SirenEntry`.

Breaking changes (pre-1.0):

- Types: `Resource` → `SirenEntry`, `ResourceReference` → `EntryReference`,
  `ResourceStatus` → `EntryStatus`, `ResourceType` → `EntryType`,
  `ResourceChange` → `EntryChange`.
- `SirenDocument.resources` → `SirenDocument.entries`.
- `SirenBuilder.fromResources` → `fromEntries`, `withResource` → `withEntry`,
  `patchResource` → `patchEntry`.
- `SirenProject.resources` → `entries`, `findResourceById` → `findEntryById`.
- `EntryGraph` (formerly `ResourceGraph`): `fromEntries`, `entries`,
  `getEntry`, `hasEntry`.
- Diagnostic fields: `resourceId` → `entryId`, `resourceType` → `entryType`
  on `DanglingDependencyDiagnostic` and `DuplicateIdDiagnostic`.
- `DocumentChange.resources` → `entries`; `PatchResult` `ResourceChange`
  fields renamed (`resourceId` → `entryId`).
- Utilities: `findResourceById` → `findEntryById`; pipeline envelope
  `rawResources` → `rawEntries`; source-attribution helpers renamed
  (`*ForResource` → `*ForEntry`).
