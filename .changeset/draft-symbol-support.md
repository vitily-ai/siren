---
"@sirenpm/language": minor
---

Grammar now accepts a generalized status modifier slot on resource declarations.
Resources can be declared as `task foo draft {}` (in addition to the existing
`task foo complete {}`). Multiple status tokens collapse last-wins with a new
WL002 warning; unknown tokens are dropped with a WL003 warning. The decoder
threads the status keyword into `Resource.status`. Exporters and formatters
round-trip the keyword byte-faithfully.

Diagnostic-code semantics change: WL003 is repurposed from the previously
unreachable "unsupported resource type" case to "unknown status keyword on
resource". Any tooling that pattern-matched WL003's old message must update.
