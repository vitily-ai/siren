---
"@sirenpm/core": minor
---

Remove `Document` primitive from core; demote origin; improve diagnostics.

- **Document removed**: The `SirenDocument` type and the synthesis module have
  been removed from `@sirenpm/core`. Document-level modeling now lives solely in
  `@sirenpm/language`. The builder no longer emits or consumes documents;
  `SirenProject` works directly with entries.
- **Structure extensions preserved opaquely**: Extension properties on entries
  are now preserved opaquely through assembly, patches, and serialization
  without requiring explicit schema awareness in core.
- **Origin removed**: The `Origin` concept and all origin-related types, fields,
  and logic have been removed from core. Origin tracking is now a
  language-layer concern.
- **More expressive diagnostic constraints**: Core diagnostic types enhanced to
  allow type system to enforce package/severity code consistency.
