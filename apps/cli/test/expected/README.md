This directory contains golden expectations for the CLI tests.

Two golden file patterns are supported:

1. **Per-file golden** (plain `.txt`): A single file with JSON frontmatter and
   expected stdout or stderr content.
2. **Directory-level golden** (`.out.txt` inside a subdirectory): A combined
   stdout/stderr expectation file accompanied by sibling files that represent
   the expected filesystem state after the command runs.

---

## Pattern 1: Combined stdout/stderr expectation files (`*.out.txt`)

We use a single file with the extension `.out.txt` to contain the expected
metadata, stdout, and stderr for a scenario. This keeps a golden scenario
self-contained and easy to review.

Structure:

1. JSON frontmatter (single JSON object) describing the scenario. Required keys:
   - `fixture`: the fixture directory under `packages/language/test/fixtures/projects/`
   - `command`: the `siren` command line to run (as a single string)

2. A line with three hyphens (`---`) on its own to separate the frontmatter from stdout.

3. The expected stdout content (may be empty). Trailing whitespace is ignored by the test harness.

4. A line with three hyphens (`---`) on its own to separate stdout from stderr.

5. The expected stderr content (may be empty). Lines starting with `#` are treated as comments by the tests and ignored.

Example (`example.out.txt`):

```
{
  "fixture": "my-project",
  "command": "siren show <entry-id>"
}
---
some expected stdout line
---
Warning: skipping siren/broken.siren (parse error)
```

Notes
-----
- When writing new golden scenarios, prefer `*.out.txt` with both sections even if one is empty.
- The test harness will only assert stdout/stderr if the corresponding section contains non-comment content.
- Use the `scripts/create-golden.sh` helper to generate `.out.txt` files consistently.

---

## Pattern 2: Directory-level golden (disk output + stdio)

When a golden file is named `.out.txt` and placed **inside a subdirectory** of
`expected/`, the harness checks not only stdout and stderr but also that the
working directory's **filesystem state matches the contents of that subdirectory**.

This is useful for commands that generate or modify files (e.g. `siren init`,
`siren update`, etc.). The sibling files and directories alongside `.out.txt`
serve as the expected disk state.

### Structure

```
expected/
  my-scenario/                     # subdirectory name is the scenario name
    .out.txt                       # metadata + expected stdout / stderr
    generated-file.txt             # expected on-disk file (compared by content)
    some-dir/                      # expected on-disk directory
      nested-output.md             # expected file inside the directory
```

The `.out.txt` file follows the same format as Pattern 1 (JSON frontmatter,
then `---`, stdout, `---`, stderr).

### How it works

1. The test runs the command described in the JSON frontmatter.
2. stdout and stderr are asserted against the content in `.out.txt` (same as Pattern 1).
3. The harness calls `assertDirMatchesExpected()` to recursively compare every
   file in the working directory against the files in `expected/my-scenario/`,
   excluding `.out.txt` itself from the comparison.

Files matched by the `ignoreGlobs` option (currently only `.out.txt`) are
skipped during the filesystem comparison.

### Example

```
expected/
  init-project/
    .out.txt
    siren/
      init.siren
```

`.out.txt` contents:

```
{
  "fixture": "my-project",
  "command": "siren init init.siren"
}
---
Created siren/init.siren
---

```
