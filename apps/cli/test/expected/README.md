This directory contains golden expectations for the CLI tests.

Format for combined expectation files
----------------------------------

We use a single file with the extension `.out.txt` to contain the expected
metadata, stdout, and stderr for a scenario. This keeps a golden scenario
self-contained and easy to review.

Structure:

1. JSON frontmatter (single JSON object) describing the scenario. Required keys:
   - `fixture`: the fixture directory under `packages/core/test/fixtures/projects/`
   - `command`: the `siren` command line to run (as a single string)

2. A line with three hyphens (`---`) on its own to separate the frontmatter from stdout.

3. The expected stdout content (may be empty). Trailing whitespace is ignored by the test harness.

4. A line with three hyphens (`---`) on its own to separate stdout from stderr.

5. The expected stderr content (may be empty). Lines starting with `#` are treated as comments by the tests and ignored.

Example (`example.out.txt`):

```
{
  "fixture": "my-project",
  "command": "siren list -t"
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
