---
status: accepted
---

# IR Build Is a Strict Forward-Pass Module Pipeline

`IRAssembly.build()` constructs an `IRContext` exclusively through a strict, strongly-typed forward-pass pipeline composed of pure modules. The pipeline is the only path used to build an `IRContext` and is an internal implementation detail of core; consumers interact with `IRAssembly` and `IRContext` only.

## Motivation

Prior to this refactor the IR build flow was a single consolidated `buildIRContextSnapshot` function that called `normalizeResources` and `analyzeResources` in sequence. Several smells accumulated:

- **Redundant graph construction.** `buildDependencyGraph` was invoked twice inside normalization alone (once in `resolveImplicitMilestoneCompletion`, once in `normalizeResources`), and again inside utility helpers like `getDependencyTree` and `getTasksByMilestone` on every query — 4-5 graph builds per project.
- **Ambiguous ownership.** Diagnostic emission (W001, W002, W003), graph construction, and implicit completion lived in shared free functions whose responsibilities and execution order had to be understood holistically.
- **Coarse-grained tests.** Verifying a single derivation required setting up the whole snapshot pipeline.

## Decision

The build pipeline is a chain of pure modules. Each module:

- is a pure function `(input) => additions`;
- declares only the envelope keys it directly needs;
- does not mutate its input (deeply frozen);
- can replace an existing envelope key by returning the same name (this is how "logical mutation" is encoded).

The runner is linear. A module's "direct upstream" is the immediately preceding module; indirect dependencies are carried opaquely through the envelope without the module needing to know about them.

### Topology

```
seed { rawResources }
  → Dedup       adds   { resources, duplicateDiagnostics }
  → Index       adds   { resourcesById }
  → Graph       adds   { graph }
  → Completion  rewrites { resources, resourcesById }   (graph stays valid)
  → Cycles      adds   { cycles, cycleDiagnostics }
  → Dangling    adds   { danglingDiagnostics }
  → Finalize    adds   { diagnostics }
```

`Completion` does not invalidate `graph` because implicit completion only flips `complete: true`; it does not touch `id` or `depends_on`. `resourcesById` is rebuilt by `Completion` because it holds Resource references whose `complete` field has changed.

### Cached derivations on `IRContext`

`IRContext` retains the pipeline's terminal envelope and exposes the cached `graph` (readonly) so query helpers (`getDependencyTree`, `getTasksByMilestone`) reuse it instead of rebuilding. Utility signatures (`getDependencyTree`, `getTasksByMilestone`) accept an optional injected `DirectedGraph` for the same reason.

### Removed surface

`IRContextSnapshot` and `buildIRContextSnapshot` are deleted. They were never part of the public surface but represented a leakier internal contract than the typed pipeline envelope.

## Alternatives Considered

- **Multi-input DAG runner with parallel branches.** The proposed topology can be expressed as a chain once we accept that "depends on graph + resources" is just "later in the chain after both are in the envelope." A parallel combinator was deferred until a real use case appears.
- **Module-side merge (`(in) => in & Added`).** Rejected in favour of caller-side merge — the runner spreads additions onto the envelope in one place, keeping module bodies focused on their addition shape.
- **Source attribution as a dedicated module.** Source attribution is a per-diagnostic helper, not a derivation over all resources, so it remains a utility called by the cycle/dangling/duplicate diagnostic functions.

## Consequences

- Diagnostic ordering and source attribution behavior are preserved byte-for-byte; this is a structural refactor, not a behavioral one.
- `buildDependencyGraph` is invoked exactly once per `IRAssembly.build()` (regression-tested in `packages/core/src/ir/pipeline/pipeline.test.ts`).
- New derivations (e.g. transitive blockers, milestone roll-ups) plug in as additional modules with surgical attribution of "what changed where" via per-module unit tests.
- Async modules and pipeline tracing are not yet supported. They can be added later without breaking existing modules.
