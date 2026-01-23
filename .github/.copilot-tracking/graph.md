
Graph utility — analysis & recommendation
=======================================

**Update (January 23, 2026)**: The manual graph utility has been implemented as `DirectedGraph` in `packages/core/src/utilities/graph.ts`, with cycle detection integrated into the decoder. The implementation follows the short-term recommendation below.

Summary
-------
- Short-term: implement a tiny, in-repo directed-graph helper in `packages/core`.
- Medium-term: if feature needs expand (many algorithms, analytics, serialization), adopt a small, well-tested external lib such as `dependency-graph` or `graphlib`.

Why a small in-repo helper now
------------------------------
- The core package currently needs a small set of graph features: build adjacency from resources, topological ordering, and cycle detection / warnings. These are simple, well-bounded operations.
- Keeping core dependency-free preserves portability (core is environment-agnostic and intended to be minimal).
- Writing a tiny utility (Map<string, Set<string>> based adjacency, DFS/Kahn topo-sort, cycle detection) yields minimal surface area, easy tests, and aligns with existing TODOs in `packages/core/HANDOFF.md`.

When to adopt an external library
---------------------------------
- Adopt when requirements grow beyond topo/cycle and include many graph algorithms, large graphs, serialization, or cross-package reuse.
- Candidate libraries:
	- `dependency-graph` — tiny, focused on dependency/topo use-cases; simple API (addNode/addDependency/overallOrder).
	- `graphlib` (@dagrejs/graphlib) — established, supports cycles and multiple algorithms; moderate footprint.
	- `graphology` — powerful and extensible, heavier than the above.

Quick implementation plan (recommended)
--------------------------------------
1. Add `packages/core/src/utilities/graph.ts` implementing:
	 - `add(node)`
	 - `addEdge(src, dst)`
	 - `topoSort()` (Kahn or DFS)
	 - `findCycles()` (return cycle roots or node lists)
	 - `dependents(node)` / `predecessors(node)` helpers
2. Refactor `packages/core/src/utilities/milestone.ts` to build the graph from IR resources and use the graph helpers for ordering and cycle warnings.
3. Add unit tests under `packages/core/test` mirroring existing fixture patterns.

Relevant files / evidence
-------------------------
- Decoder & IR: `packages/core/src/decoder/index.ts` (CST→IR responsibilities).
- Utilities: `packages/core/src/utilities/milestone.ts` (where dependency logic belongs).
- Types: `packages/core/src/ir/types.ts` (Resource shape — small, readonly structures).
- Roadmap note: `packages/core/HANDOFF.md` (mentions array support and circular-dependency warning).

If you want, I can scaffold `graph.ts` and refactor `milestone.ts` now with tests.

