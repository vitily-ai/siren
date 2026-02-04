<!-- markdownlint-disable-file -->

# Task Research Notes: Dangling-Dependencies Implementation

## Research Executed

### File Analysis

- [packages/core/src/decoder/index.ts](packages/core/src/decoder/index.ts)
  - Current diagnostics system emits warnings with codes (W001, W002, W003, W004) and errors (E001)
  - Diagnostics are collected during decoding via `decode()` function
  - Cycle detection implemented in decoder using `DirectedGraph` 
  - Decoder returns `DecodeResult` with `diagnostics` array, `document`, and `success` flag
  - Pattern: Graph built from all resources, cycles extracted, W004 warnings emitted for each cycle

- [packages/core/src/ir/context.ts](packages/core/src/ir/context.ts)
  - `IRContext` wraps a decoded `Document` (plain data with resources and cycles)
  - Provides utility method `getIncompleteLeafDependencyChains()` which has `onWarning` callback option
  - No diagnostics collection at IR construction time currently
  - IR is immutable and frozen

- [apps/cli/src/project.ts](apps/cli/src/project.ts)
  - Project loading collects warnings during decoding phase
  - Pattern: For each file, parses, decodes, and collects `decodeResult.diagnostics` 
  - Warnings formatted as: `Warning: ${relPath}: ${diagnostic.message}` for diagnostic warnings
  - Also has warnings for parse errors: `Warning: skipping ${relPath} (parse error)`
  - CLI creates `IRContext.fromResources()` from aggregated resources after file loading

- [apps/cli/test/expected/dangling-dependencies.out.txt](apps/cli/test/expected/dangling-dependencies.out.txt)
  - Expected output shows 3 dangling warnings with W005 code pattern
  - Format: `Dangling dependency: <type> '<id>' -> <missing>?`
  - Example: `Dangling dependency: milestone 'with-dangling' -> missing-task?`
  - Appears in CLI warning output with file path: `Warning: siren/main.siren: <message>`

### Code Search Results

- Diagnostic codes in use:
  - E001: Parse-time errors (complete keyword in invalid position)
  - W001: Complete keyword conflicts
  - W002: Duplicate complete keywords
  - W003: Complete keyword on unsupported resource type
  - W004: Circular dependency detected
  - W005: (reserved for dangling-dependency warnings per convention)

- Cycles pattern in decoder shows:
  - Graph built with `graph.addNode()` and `graph.addEdge()`
  - Cycles retrieved via `graph.getCycles()`
  - For each cycle, diagnostic emitted with W004 code
  - Cycle detection happens in decode(), before returning DecodeResult

- Resource reference extraction:
  - `getDependsOn()` function extracts dependency IDs from `depends_on` attribute
  - Handles single references and arrays of references
  - Returns array of dependency IDs

### Project Conventions

- Standards referenced: 
  - Diagnostic codes use W### for warnings, E### for errors
  - Messages follow pattern: `<Type>: <description>`
  - CLI surfaces warnings with format: `Warning: <file>: <message>`
  - Golden tests in `apps/cli/test/expected/` document CLI behavior with metadata

- Instructions followed:
  - IR diagnostics should be collected during construction (decoder phase)
  - Clients receive diagnostics via DecodeResult
  - Diagnostic message format: "Dangling dependency: <type> '<id>' -> <missing>?"
  - One warning per dangling relationship (not aggregated)

## Key Discoveries

### Current Architecture for Diagnostics

The decoder phase (`decode()` function) is responsible for:
1. Creating resources from CST nodes
2. Building dependency graph from all resources
3. Detecting structural issues (cycles currently)
4. Emitting diagnostics for detected issues
5. Returning `DecodeResult` with `diagnostics` array

The CLI loads projects by:
1. Finding all .siren files
2. Parsing each file
3. Decoding with `decode()` - collects diagnostics
4. Aggregating resources across files
5. Creating `IRContext` from aggregated resources
6. Displaying warnings from collected diagnostics

### How Cycles Are Currently Detected

```typescript
// From decoder/index.ts lines ~260-280
const graph = new DirectedGraph();
for (const resource of resources) {
  graph.addNode(resource.id);
  const dependsOn = getDependsOn(resource);
  for (const depId of dependsOn) {
    graph.addEdge(resource.id, depId);
  }
}
const cycles = graph.getCycles();
const cyclesIr: Cycle[] = cycles.map((cycle) => ({ nodes: cycle }));

// Add warnings for each cycle
for (const cycle of cycles) {
  diagnostics.push({
    code: 'W004',
    message: `Circular dependency detected: ${cycle.join(' -> ')}`,
    severity: 'warning',
  });
}
```

### What Dangling Dependencies Are

A dangling dependency occurs when a resource references a dependency ID in its `depends_on` attribute, but that ID doesn't exist in the set of defined resources. 

Example from expected output:
```
task present { }
milestone with-dangling {
  depends_on = [present, missing-task]  // missing-task doesn't exist
}
```

This should emit: `Dangling dependency: milestone 'with-dangling' -> missing-task?`

### Implementation Requirements

From dangling-dependencies.siren and expected output:

1. **Detect dangling dependencies** in decoder during graph construction
   - After building all resources, check each dependency ID exists in resource set
   - Emit one W005 warning per dangling relationship
   
2. **Track missing IDs** per resource
   - For each resource's `depends_on` values, verify each ID exists
   
3. **Format warning message**
   - Pattern: `Dangling dependency: <resource-type> '<resource-id>' -> <missing-id>?`
   - Example: `Dangling dependency: milestone 'with-dangling' -> missing-task?`
   - Trailing `?` indicates missing reference

4. **Missing dependencies should NOT be collected** by listing APIs
   - The expected output shows `missing-task` and `missing1`/`missing2` are still rendered
   - But presumably should not be treated as real resources for dependency chain calculations
   - This is already implicit since only defined resources are in the resources array

5. **Warnings surface in CLI**
   - CLI already iterates diagnostics and formats as `Warning: ${relPath}: ${diagnostic.message}`
   - Dangling warnings will appear alongside cycle warnings in project loading

### Test Fixtures

The dangling-dependencies fixture directory is currently empty:
- `/home/gan/Desktop/siren/packages/core/test/fixtures/projects/dangling-dependencies/` exists but is empty
- Expected golden test output exists at `apps/cli/test/expected/dangling-dependencies.out.txt`
- This output expects `siren/main.siren` to exist with resources demonstrating dangling dependencies

## Recommended Approach

Implement dangling-dependency detection in the **decode phase** by:

1. **In decoder/index.ts `decode()` function**:
   - After building the resource graph, create a set of all defined resource IDs
   - For each resource, iterate its `depends_on` values
   - For each dependency ID that doesn't exist in the resource set, emit a W005 warning
   - Format: `Dangling dependency: <type> '<id>' -> <missing-id>?`
   - One warning per missing reference (not aggregated per resource)

2. **Add unit tests in decoder/index.test.ts**:
   - Test single dangling dependency emission
   - Test multiple dangling dependencies in single resource
   - Test mixed valid and dangling dependencies
   - Test no warnings when all dependencies exist

3. **Create test fixture in packages/core/test/fixtures/projects/dangling-dependencies/**:
   - Create `siren/main.siren` with resources matching expected output:
     - `with-dangling` milestone depending on `[present, missing-task]`
     - `with-two-dangling` milestone depending on `[missing1, missing2]`
     - `present` task (to show some dependencies are valid)

4. **Verify golden test passes**:
   - Golden test already expects output in `apps/cli/test/expected/dangling-dependencies.out.txt`
   - Once fixture exists and decoder emits W005 warnings, golden test should pass

## Implementation Guidance

- **Objectives**: 
  - Detect when resources reference non-existent dependency IDs
  - Emit user-friendly warnings with diagnostic code W005
  - Surface warnings in CLI output during project loading
  - Support unit and integration testing

- **Key Tasks**: 
  1. Implement dangling detection in `decode()` function
  2. Add unit tests for decoder behavior
  3. Create dangling-dependencies test fixture
  4. Verify golden test passes with fixture

- **Dependencies**: 
  - No external dependencies needed (uses existing DirectedGraph and diagnostics system)
  - Builds on existing cycle detection pattern

- **Success Criteria**: 
  - Unit tests pass validating W005 emission
  - Golden test passes with fixture file
  - Multiple dangling warnings correctly emitted (not aggregated)
  - Warnings include resource type, ID, and missing ID with trailing `?`

