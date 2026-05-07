---
status: accepted
supersedes: 0001-ircontext-built-semantic-snapshot
---

# Core IRAssembly Migration Is a Breaking 0.x Cleanup

Siren is still in semver 0.x, so the core IRAssembly prerequisite will remove vestigial core construction surfaces instead of carrying deprecated compatibility paths. IRContext remains a non-publicly constructible class built through IRAssembly, Resource origins replace document-level source metadata, and semantic diagnostic behavior stays stable where it does not complicate the core. Language and CLI adoption remain explicit follow-up entries rather than part of the core prerequisite.
