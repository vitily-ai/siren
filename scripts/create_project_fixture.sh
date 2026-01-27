#!/usr/bin/env bash

# Prevent the script from being sourced. If sourced, return an error instead
# of calling `exit` which would close the user's shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "This script is meant to be executed, not sourced. Run: bash $0 <slug>" >&2
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

usage() {
  echo "Usage: $0 <slug>"
  exit 2
}

if [ $# -ne 1 ]; then
  usage
fi

slug="$1"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
projects_root="$repo_root/packages/core/test/fixtures/projects"
fixture_siren_dir="$projects_root/$slug/siren"

mkdir -p "$fixture_siren_dir"
printf 'Created fixture directory: %s\n' "$fixture_siren_dir"

if command -v siren >/dev/null 2>&1; then
  if (cd "$fixture_siren_dir" && siren init); then
    printf 'Initialized project with siren in %s\n' "$fixture_siren_dir"
    mv "$fixture_siren_dir/siren/main.siren" "$fixture_siren_dir/$slug.siren"
    printf 'Renamed main.siren to %s.siren\n' "$slug"
    rm -f "$fixture_siren_dir/siren.config.yaml"
    printf 'Removed generated config file if present\n'
  else
    printf 'siren init failed; creating fallback %s.siren\n' "$slug"
    printf "# %s fixture\n" "$slug" > "$fixture_siren_dir/$slug.siren"
  fi
else
  printf 'siren CLI not found; writing fallback %s.siren\n' "$slug"
  printf "# %s fixture\n" "$slug" > "$fixture_siren_dir/$slug.siren"
fi

exit 0
