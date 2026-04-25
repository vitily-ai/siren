Read [](file:///home/gan/Desktop/siren/packages/core/src/ir)

Read [](file:///home/gan/Desktop/siren/packages/core/src/ir/context.ts#1-1), lines 1 to 100

Read memory [](file:///home/gan/.config/Code/User/workspaceStorage/c6fbc2695e4d07f3610b1a3927ceb100/GitHub.copilot-chat/memory-tool/memories/repo/siren-test-ir-layer-audit.md)

Read [](file:///home/gan/Desktop/siren/packages/core/src/ir/context.ts#100-100), lines 100 to 300

Read [](file:///home/gan/Desktop/siren/packages/core/src/ir/types.ts#1-1), lines 1 to 120







Fetched 2 resources

Fetched 2 resources

Fetched 2 resources

Analyzing your answers...

Searched for regex `origin\.document|origin: \{|document:` (`**/packages/language/src/**`), 9 results

Searched for regex `SourceDocument|documents:` (`**/packages/language/src/parser/**`), 9 results

## Scrutiny of `milestone-files` plan

### Architectural verdict: synthesis in core is correct

**Recommendation: keep synthesis in core.** Briefly compared against adjacent tools:

- **Terraform**: directory = module; individual `.tf` files have **no semantic identity** — they're merged. Files are pure organization.
- **Bazel**: `BUILD` file = package boundary, but targets are *explicit*. No implicit "file-as-target."
- **Nx**: projects identified by presence of a config file; files inside a project are not nodes.
- **Make / Python modules**: the closest precedents — filename *can* be a target / module namespace.

Siren's proposal ("file = implicit milestone") sits between Make (filename-as-target) and Python (file-as-module-namespace). None of these tools synthesize at the parser level — they all do it at the project/semantic layer. That maps cleanly onto Siren's core. Specific reasons to keep it in core:

1. The feature is semantic ("file groups its entries"), not syntactic. Parsers shouldn't make PMaC decisions.
2. `origin.document` is already the contract by which file identity flows language → core. Reusing it keeps the contract honest and parser-agnostic.
3. It mirrors `isImplicitlyComplete` — also a core-side derived property with no CST involvement.
4. Web/SaaS frontends that don't have a filesystem still benefit by passing tab names / blob IDs as `document`. Pre-decode CST synthesis in language would couple this to a `SourceDocument` shape that browsers may not have in the same form.
5. No need to fabricate fake CST positions or comment associations — the `synthetic: true` flag is a cleaner expression of "this resource has no source text."

The pre-decode-in-language alternative offers no real upside: it still needs the `synthetic` flag, still needs exporter filtering, still needs cross-document collision logic in core. Net more code, worse layering.

---

### Self-consistency / correctness issues

1. **Asymmetric collision behavior is real but undocumented.** `mf-check-collision` silently suppresses synthesis when an explicit milestone of the same ID exists *in the same document*. But `mf-append-resources` notes that a *cross-document* explicit milestone wins via dedup precedence — and that path **does** emit W003. So:
   - `foo.siren` has explicit `milestone foo {}` → silent suppression.
   - `a/foo.siren` has explicit `milestone foo {}`, `b/foo.siren` has only tasks → explicit wins, but b's synthetic still gets dropped with W003.
   
   That asymmetry is defensible (cross-doc clashes are usually accidents) but should be **explicitly stated as intended** and covered by a unit test. Currently `mf-unit-tests` covers only the tasks-only cross-doc case.

   **User Response**: silent suppression is intentional if a little bit misleading. it's not supposed to be suppression in reality, it is supposed to be "optional verbosity" - defining a milestone of the same name in a file is how a user adds attributes to the milestone the file represents. if the user doesn't need that, they don't create that explicit milestone.
   Regarding the file collision with a/foo.siren + explicit and b/foo.siren, the W003 that arises should be a collision of b.foo **against the explicit milestone foo {}** in a/foo.siren. In essence, a/foo.siren should not produce a synthetic, because it already has an explicit.

2. **`mf-derive-id` and reference-target UX.** You confirmed synthetics should be first-class reference targets. The "no sanitisation" rule means a file named `My Plan.siren` produces ID `My Plan`. Bare-identifier references can't address it — users must write `depends_on = "My Plan"`. Workable, but the plan should:
   - Add a note in `mf-derive-id` that consumers needing references should prefer filenames that are valid bare identifiers.
     **User Resposne**: This is YAGNI until proven otherwise. Quoted references are valid and preexisting.
   - Add a test case for a synthetic milestone being referenced via `depends_on = "quoted name"` from another resource.
   - Decide whether `Foo.SIREN` should have its extension stripped (current plan: case-sensitive `.siren` only, so no — could surprise users on case-insensitive filesystems).
     **User Response**: This is out of scope of the milestone-files initiative. It is more of a broader question of whether the project should even load `.SIREN`.

3. **`isImplicitlyComplete` on empty `depends_on`.** A file containing only comments (or empty) gets `depends_on = []`. Most "all deps complete" predicates treat the empty set as vacuously true — meaning **every empty .siren file would be reported as a complete milestone**. Worth confirming this matches `isImplicitlyComplete`'s actual behavior in milestone.ts and either accepting it or special-casing empty synthetics. This is not addressed in the plan.
  **User Response**: This is a good catch. There is an intention for a separate feature: milestones with no dependencies and no explicit `complete` have an implicit `draft` state, which is a new state that needs to be implemented first, and is a dependency milestone to this initiative. Please create it. 

4. **Cycle interaction missing from tests.** A task in `foo.siren` that does `depends_on = foo` (the file-derived milestone) creates a cycle: `foo → task → foo`. The plan does not enumerate W001 behavior on synthetics. Add a test fixture and unit test.
  **User Response**: This is fine, but needs to be done TDD style - start red as prework before feature implementation starts.

5. **`mf-golden-tests` undersells blast radius.** "Most existing project-fixture-driven golden files will change" — true, but additionally: `siren tree` rooted at a previously-orphan task may now show a synthetic ancestor; `siren list -t` filtering will surface new milestones; dependency-tree expansion behavior (which treats milestones as leaves) means file-derived milestones become non-expanded leaves under each other's trees. Worth an explicit step in the task: "before regenerating, audit each diff for unintended structural shifts (root selection, cycle reporting, complete-rollup changes), not just additions."
   **User Response**: The mikestone-leaf concern will not come to pass because no goldens currently declare dependencies on synethic milestones (because they don't exist yet). It is a valid TDD prework scenario to set up, but not something we should expect to fail existing tests. Existing tests will only fail due to the presence of new milestones, which is foreseen. 

6. **Memory-file stale code reference.** Not a plan issue, but `/memories/repo/siren-test-ir-layer-audit.md` records diagnostic codes as W004/W005/W006 while the codebase uses W001/W002/W003. The plan correctly uses W003. The memory file should be corrected separately.
  **User Response**: Memory files cleared

---

### Completeness gaps

1. **Documentation tasks missing.** README, copilot-instructions.md, and a brief blurb in language-features.siren should mention implicit file-milestones. This is a user-visible language semantic change.
   **User Response**: language-features.siren is basically just a todo list. This initiative started there, and was moved out into **milestone-files.siren** once detailed planning started. In the future, when this feature is available, language-features.siren will be able to maintain connections to external milestones like this one.

2. **`mf-unit-tests` missing cases:**
   - Explicit `milestone foo` in `a/foo.siren` + tasks in `b/foo.siren` (cross-doc explicit precedence with W003 on b's synthetic).
   - Synthetic milestone referenced as a `depends_on` target from another file (validate first-class reference works).
   - Cycle involving a synthetic (task back-references its own file's synthetic ID).
   - Verify `isImplicitlyComplete` behavior on empty-deps synthetic.

3. **`mf-language-fixture` should also cover** the cycle-via-synthetic case if you want `mf-language-integration-test` to assert end-to-end. Currently only three sub-cases listed.
  **User Response**: Since the suggestion is to maintain synthesis in core, language package will never know about these, and so language package is probably not the right place for this kind of test.

4. **CLI flag for hiding synthetics deferred.** You confirmed "visible by default" for now. Plan correctly defers the opt-out flag, but doesn't create a follow-up task or open question for it. Add it to the "Open follow-ups" comment block (currently lists per-file opt-out and `siren list` filtering but not a CLI flag).

5. **Browser/web parity not addressed.** The plan never mentions web. Synthesis being in core means web gets it for free *if* it sets `origin.document`. Worth a one-line task or note: "Verify web constructs Documents with meaningful `document` strings (or accepts no synthesis) — no behavior regression."
   **User Response**: Ignore web

6. **Round-trip determinism test.** `mf-exporter-filter` claims format goldens should be byte-identical. Add an explicit test asserting: parse → IRContext (with synthetics) → export → re-parse → identical IRContext (modulo synthetics being regenerated). This proves no double-synthesis or accidental emission.

---

### Net assessment

- Architectural choice: **correct**, well-justified by the existing `origin.document` contract and by precedent in adjacent semantic-layer tools.
- Plan structure and task decomposition: **sound**.
- Locked decisions: **mostly internally consistent**; the same-doc-vs-cross-doc collision asymmetry is the one wart worth either codifying or reconsidering.
- Coverage gaps to address before execution: empty-deps completeness behavior, cycle-via-synthetic, cross-doc explicit precedence test, quoted-reference test, doc updates, web confirmation, round-trip golden.