# Implicit Draft Tasks

## Summary

Introduce `ImplicitDraftTaskModule` into the core IR build pipeline. A task resource whose `attributes` array contains only `depends_on` entries (or is empty), with no explicit `status` and no complete predecessor, is implicitly assigned `status='draft'`. This mirrors the existing `ImplicitDraftMilestoneModule` for orphan milestones, but uses a content-based predicate (attribute inspection) rather than a structural one (successor count).

---

## Motivation

Bare tasks — tasks written with nothing but optional dependencies and no informational attributes — are unambiguously in-progress stubs. Implicitly marking them as `draft` makes the project state more honest without requiring authors to annotate every in-progress item. It is the task-level counterpart to the already-shipped milestone implicit-draft rule.

---

## Predicate

A resource is eligible for implicit draft promotion iff **all** of the following hold:

1. `resource.type === 'task'`
2. `resource.status === undefined` (no explicit `draft` or `complete`)
3. `resource.attributes.every(a => a.key === 'depends_on')` — the only permitted attribute is `depends_on`; any other key (`description`, `details`, `link`, …) disqualifies
4. None of the resource's predecessors (resources that `depends_on` this task) is `isComplete(...)` — short-circuit on the first complete predecessor found. Unresolved predecessor ID → throw a core invariant error (this should not be reachable after `DedupModule`).
5. Zero predecessors → trivially satisfies condition 4 (orphan bare task → draft).

When eligible: `{ ...resource, status: 'draft' }` and rebuild `ResourceGraph.fromResources`.

---

## Pipeline Topology

The module is inserted **after** `ImplicitCompletionModule` and **before** `CyclesModule`:

```
Synthesis → Dedup → Graph → ImplicitDraftMilestone → ImplicitCompletion → ImplicitDraftTask → Cycles → Dangling → Finalize
```

Running after `ImplicitCompletion` means the parent-completeness gate always sees settled completion state. A bare task that is depended on by an already-complete milestone would not be drafted, which avoids contradiction without needing a separate diagnostic.

This is the key difference from `ImplicitDraftMilestoneModule` (which runs *before* completion): tasks can never be implicitly completed, so they don't need to influence the completion pass. They do, however, need to *see* completion before deciding whether to draft.

---

## Predecessor vs. Successor direction

`graph.getSuccessors(id)` returns the resources that `id` depends *on* (outbound edges).
`graph.getPredecessors(id)` returns the resources that depend *on* `id` (inbound edges).

The gate checks **predecessors**: if something depending on this task is already complete, do not draft the task. This matches the semantic intent — a complete parent milestone has already resolved the task's fate.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Attribute allowlist | Only `depends_on` qualifies | Any informational attribute signals intent; bare tasks signal a stub |
| Pipeline position | After `ImplicitCompletion` | Predecessor-completeness gate requires settled completion state |
| Predecessor types | Any type (task or milestone) gates | Consistency; a complete task predecessor is just as blocking |
| Orphan bare task | Eligible (no preds → trivially passes gate) | An isolated stub with no context is unambiguously a draft |
| Unresolved predecessor | Core invariant throw | Should not be reachable post-dedup |
| Project fixture | None (unit + pipeline integration only) | Coverage mirrors the milestone module pattern, which also has a project fixture; no duplicate fixture needed here |
| Cycles | Not handled | Consistent with `ImplicitDraftMilestoneModule`; captured as debt |
| Symmetric milestone gate | Out of scope | Captured as a follow-up task (`implicit-draft-milestone-parent-gate`) |

---

## Test Coverage Plan

### `implicit-draft-task.test.ts` (module unit tests)

Mirror the structure of `implicit-draft-milestone.test.ts`:

- Bare orphan task `task t {}` → `status='draft'`
- Task with only `depends_on` and no complete predecessors → `draft`
- Task with `description` only → untouched (`status` remains `undefined`)
- Task with `description` + `depends_on` → untouched
- Explicit `complete` task → untouched
- Task with at least one complete predecessor → untouched
- Task with mixed predecessors (one complete, one incomplete) → untouched (short-circuit on first complete)
- Milestone resources → never affected by this module

### `pipeline.test.ts` (integration block)

- Confirm `ImplicitDraftTaskModule` runs after `ImplicitCompletionModule` (a parent milestone that implicitly completes before task promotion is not retroactively undone by a later task becoming draft)
- An orphan bare task in a project with otherwise-complete milestones becomes `draft` without affecting already-settled milestone completion
- A bare task depended on by a complete predecessor remains `undefined`

---

## Affected Files

| File | Change |
|---|---|
| `packages/core/src/ir/pipeline/modules/implicit-draft-task.ts` | New module |
| `packages/core/src/ir/pipeline/modules/implicit-draft-task.test.ts` | New unit test file |
| `packages/core/src/ir/pipeline/index.ts` | Wire module; update topology docblock |
| `packages/core/src/ir/pipeline/pipeline.test.ts` | Add pipeline-integration block |

---

## Out of Scope / Follow-ups

- **`implicit-draft-milestone-parent-gate`**: Add the same "no complete predecessor" gate to `ImplicitDraftMilestoneModule` for symmetry. Today, an orphan milestone is drafted even when a complete parent depends on it.
- **Cycle-aware implicit promotion**: Neither implicit-draft module currently checks whether the candidate resource is part of a cycle. Captured in `debt.siren` as `implicit-promotion-cycles`.
- **`contradictory-completion-diagnostic`**: A resource that is `complete` while a direct dependency is `draft` should produce a warning. Depends on this milestone shipping first.
- **Grammar `draft` keyword** (`draft-symbol-support`): The `draft` status cannot yet be declared inline in `.siren` source; that is a separate language milestone.
