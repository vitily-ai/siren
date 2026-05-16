# PatchResult: SirenBuilder Mutation Delta API

## Summary

Replace `SirenBuilder.patch()` and all convenience mutation wrappers (`withDocument`, `patchDocument`, `withResource`, `patchResource`) so they return a structured `PatchResult` describing exactly what changed, instead of returning a bare `SirenBuilder`. This enables downstream consumers — particularly the CLI write phase — to determine which files need rewriting after a mutation without performing their own before/after comparison.

This is a breaking change to the public `@sirenpm/core` API. CLI and language consumers will have compile-time failures until updated in a follow-up milestone.

---

## Motivation

The CLI lifecycle currently re-serialises every parsed document after any mutation and writes back all files, even unchanged ones. To improve this, the write phase needs a delta: which documents (files) actually changed, and at what granularity. `PatchResult` provides this data directly from the mutation site so consumers never need to reconstruct it.

---

## Public API Shape

```ts
export type ChangeMode = 'created' | 'updated' | 'deleted';

export interface ResourceChange {
  resourceId: string;
  mode: ChangeMode;
}

export interface DocumentChange {
  documentId: string;
  mode: ChangeMode;
  resources: readonly ResourceChange[]; // always present; may be empty
}

export interface PatchResult {
  builder: SirenBuilder;
  changes: readonly DocumentChange[]; // always present; may be empty
}
```

`PatchResult` is **not** frozen at runtime — it is a plain data object. Arrays and fields are `readonly` in TypeScript to discourage accidental mutation.

### Methods that now return `PatchResult` (breaking change)

- `patch(fn): PatchResult`
- `withDocument(doc): PatchResult`
- `patchDocument(documentId, fn): PatchResult`
- `withResource(resource, documentId?): PatchResult`
- `patchResource(resourceId, fn): PatchResult`

### Methods unchanged

- `static fromDocuments(docs): SirenBuilder`
- `static fromResources(resources, ephemeralDocumentId): SirenBuilder`
- `get documents: readonly SirenDocument[]`
- `build(): SirenProject`

### No chaining

Because mutation methods now return `PatchResult` instead of `SirenBuilder`, you cannot chain directly. Consumers must unwrap `.builder` between steps:

```ts
// Before (chaining — no longer works)
const builder = original.withResource(r1).withResource(r2);

// After (explicit unwrap)
const { builder: b1 } = original.withResource(r1);
const { builder: b2 } = b1.withResource(r2);
```

---

## Resource Identity: Ephemeral IDs

### Problem

Structural equality comparison is expensive and fragile. User-facing `resourceId` alone is insufficient because renaming a resource (`id` changes) should register as delete + create, not update.

### Solution: Non-enumerable Symbol Property

Each resource object receives a non-enumerable, symbol-keyed ephemeral ID (`EPH_ID`) at ingestion (inside `fromDocuments`). The symbol is module-internal and not part of the public API.

```ts
const EPH_ID: unique symbol = Symbol('sirenEphId');

Object.defineProperty(resource, EPH_ID, {
  value: nextEphId(),   // monotonic counter: 'r1', 'r2', ...
  enumerable: false,    // drops on spread / Object.assign
  writable: false,
  configurable: false,
});
```

Key properties of non-enumerable symbol:

| Operation | Eph ID preserved? | Effect |
|-----------|-------------------|--------|
| Pass same frozen object reference back | Yes | Treated as unchanged |
| `{ ...resource }` spread | **No** | Treated as modified (updated or created) |
| `JSON.parse(JSON.stringify(resource))` | **No** | Treated as modified (documented edge case; acceptable) |
| `Object.freeze(clonedResource)` (internal clone) | Copied explicitly by `cloneAndFreezeResources` | Preserved |

### Counter

Monotonic integer counter (`let next = 0; () => 'r' + String(++next)`) gives deterministic IDs for tests.

---

## Delta Computation

### Document layer

Documents are keyed by `documentId`. Duplicate `documentId` across the document list is an implementation error (not a user-facing validation concern) — it causes a throw at ingestion.

| Before state | After state | Document mode |
|---|---|---|
| Present | Absent | `deleted` |
| Absent | Present | `created` |
| Present | Present | Compare resources + directive |

A document in both states is included in `changes` as `updated` if and only if:
- Its resource-level delta is non-empty, **or**
- Its `directive` changed structurally.

If neither condition holds, the document is omitted from `changes` entirely (no "unchanged" entry).

### Resource layer (within a matched document pair)

Resources within a document are joined by `resourceId`.

| Before (by resourceId) | After (by resourceId) | Eph ID match | Resource mode |
|---|---|---|---|
| Absent | Present | n/a | `created` |
| Present | Absent | n/a | `deleted` |
| Present | Present | Same eph ID | Omit (no change) |
| Present | Present | Different eph ID | `updated` |

### Directive-only document change

If a document's `directive` changes but no resources changed, the document entry is `{ documentId, mode: 'updated', resources: [] }`.

### Reordering

Document reordering and resource reordering within a document produce no change (ID-keyed comparison, order ignored). This is intentionally forward-compatible with a future stable-sort guarantee.

### Rename = delete + create

Renaming a resource (changing its `id`) produces no matching pair on the `resourceId` join key, so the old entry appears as `deleted` and the new entry appears as `created`.

### Move across documents = delete in source + create in destination

Even if the caller passes the same object reference (eph ID preserved), the resource is looked up within each document's before/after pair independently. Since the source document no longer has that `resourceId`, it registers as deleted there; since the destination document did not previously have that `resourceId`, it registers as created there.

---

## No-op Patch

If `fn` returns the same document array (all eph IDs preserved, no directive changes):

- `changes: []` — empty
- `builder` — a **fresh** `SirenBuilder` instance (not `===` original); no reference equality guarantee

---

## Error: Duplicate Resource Object Reference

If the same resource object reference appears in more than one document slot in the after-state (same eph ID in two places), `fromDocuments` throws. This is treated as an implementation error, not a user-facing validation concern.

---

## Files Changed

| File | Status | Purpose |
|---|---|---|
| `packages/core/src/ir/eph-id.ts` | **New** | `EPH_ID` symbol, `stampEphId`, `getEphId`, counter |
| `packages/core/src/ir/patch-result.ts` | **New** | `PatchResult`, `DocumentChange`, `ResourceChange`, `ChangeMode` types + `computeDelta` |
| `packages/core/src/ir/assembly.ts` | Modified | Mutation methods rewritten to return `PatchResult` |
| `packages/core/src/ir/snapshot.ts` | Modified | `cloneAndFreezeResources` stamps/preserves eph IDs; throws on duplicate refs |
| `packages/core/src/index.ts` | Modified | Export `PatchResult`, `DocumentChange`, `ResourceChange`, `ChangeMode` |
| `packages/core/test/assembly-patch.test.ts` | Modified | Full coverage rewrite (see below) |

`EPH_ID` and internal helpers are **not** exported from the public surface.

---

## Test Coverage

All tests live in `packages/core/test/assembly-patch.test.ts`.

- Resource `created` — new object with novel `resourceId`
- Resource `updated` — spread/clone of existing resource with same `resourceId`
- Resource `deleted` — omitted from new docs
- Resource moved across documents — `deleted` in source document, `created` in destination document
- Document `created` — new document not present before
- Document `updated` — contains resource changes
- Document `deleted` — removed from builder
- Directive-only change — document `updated` with `resources: []`
- No-op patch — `changes: []`, fresh builder (not `===` original)
- Eph ID preserved through unchanged-passthrough patch
- Convenience wrappers (`withDocument`, `withResource`, `patchDocument`, `patchResource`) each return correct `PatchResult`
- Construction throws on duplicate eph ID (same resource object in two document slots)
- JSON round-trip drops eph ID → `updated` classification (documented edge case)

---

## Scope and Follow-ups

This change is intentionally scoped to `packages/core`. `@sirenpm/cli` and `@sirenpm/language` consumers will have compile-time failures after publication and require a follow-up milestone to:

1. Update `apps/cli/src/lifecycle/mutation.ts` to unwrap `.builder` from `PatchResult`.
2. Update `apps/cli/src/lifecycle/write.ts` to consume the `changes` delta to select which files to write.
3. Pin updated `@sirenpm/core` version in CLI and language packages.
