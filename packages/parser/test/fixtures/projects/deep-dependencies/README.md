# Deep Dependencies Fixture

This fixture is designed to test the core traversal logic for deep dependency trees in Siren projects.

## Purpose
- Exercise dependency resolution with chains of varying depths (e.g., 2, 10 levels deep).
- Test multiple branches in dependency graphs.
- Validate handling of milestone dependencies as leaf nodes.
- Cover edge cases like incomplete (missing) dependencies and overlapping cycles.

## Expected Behavior
- The project should decode successfully, with warnings for cycles and missing references.
- Dependency trees should be correctly indexed and traversable.
- Milestones should be treated as leaf dependencies in the graph.
- Incomplete dependencies should emit appropriate diagnostics (e.g., unresolved references).

## Structure
- `main.siren`: Contains tasks and milestones with deep, branched, and cyclic dependencies.