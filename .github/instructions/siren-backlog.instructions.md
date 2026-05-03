---
description: "Use when creating, editing, triaging, or maintaining the Siren dogfood backlog in siren/*.siren files. Covers backlog file purpose, task vs milestone conventions, completion updates, naming, and debt review hygiene."
applyTo: "siren/*.siren"
---
# Siren Dogfood Backlog Conventions

- Treat files under `siren/` as the maintained project backlog, not as throwaway examples.
- Preserve each file's rough purpose. `todos.siren` is for incomplete drafts and half-formed items. `debt.siren` is for technical debt, cleanup, consistency work, and externally reported implementation issues. `extras.siren` is for small side-projects or adjacent experiments that do not yet deserve a larger initiative file.
- Those file boundaries are intentionally fuzzy. When an item could fit in more than one file, choose the file that will make future triage easiest and avoid duplicating the item.
- Default to `task` for actionable work. A task is the explicit unit of implementation and the unit that must be updated when work ships.
- Use `milestone` only to group multiple tasks or sub-milestones under an initiative. Milestones carry semantic weight because they auto-complete when all dependencies are complete, so do not use them as interchangeable labels for single tasks.
- In a new initiative file, prefer one top-level milestone with the file's tasks feeding into it through `depends_on`. Add dependent sub-milestones only for genuinely large or multi-phase work.
- Dumping-ground files such as `todos.siren`, `debt.siren`, and `extras.siren` may stay flatter and do not need a synthetic wrapper milestone just to satisfy structure.
- Keep identifiers lowercase kebab-case. For larger initiatives, use a short shared prefix for related tasks and sub-milestones when it improves grouping and grep-ability.
- Every item should have a durable `description`. Add custom fields such as `feedback`, `link`, `details`, `requirements`, or `obsoletes` only when they add lasting backlog value.
- When a task has been addressed by implementation, mark that exact task with the bare `complete` keyword in the Siren source during the same change.
- When active work makes an item in `debt.siren` irrelevant, mark it `complete`, replace it with a better-scoped follow-up, or remove/supersede it in the same backlog maintenance pass. Do not leave resolved debt behind as live backlog.
- For large or subtle initiatives, keep short decision or verification comments near the relevant milestone instead of burying all context in task descriptions.

Preferred initiative shape:

```siren
milestone feature-area {
  depends_on = [feature-area-parser, feature-area-tests]
}

task feature-area-parser {
  description = "Implement the parser slice"
}

task feature-area-tests complete {
  description = "Land focused regression coverage"
}
```