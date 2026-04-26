#!/usr/bin/env bash
# Rewrite every @sirenpm/* dependency in downstream package.json files from a
# semver pin to the `workspace:*` protocol so Yarn resolves them locally
# instead of from the npm registry. Used by the CI integration job to detect
# breaking changes between sibling packages that the normal (registry-pinned)
# build would mask.
#
# Idempotent. Safe to run locally for debugging:
#   bash .github/workflow-utils/swap-to-workspace-protocol.sh
#   yarn install
#   yarn build && yarn test
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TARGETS=(
  "apps/cli/package.json"
  "packages/language/package.json"
)

for rel in "${TARGETS[@]}"; do
  file="${REPO_ROOT}/${rel}"
  if [[ ! -f "${file}" ]]; then
    echo "error: ${rel} not found" >&2
    exit 1
  fi
  # Match `"@sirenpm/<name>": "<anything-not-workspace>"` and rewrite the value
  # to `workspace:*`. Skips entries already on the workspace protocol.
  perl -i -pe 's#("\@sirenpm/[^"]+"\s*:\s*)"(?!workspace:)[^"]+"#\1"workspace:*"#g' "${file}"
  echo "rewrote @sirenpm/* deps -> workspace:* in ${rel}"
done
