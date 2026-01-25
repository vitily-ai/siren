#!/usr/bin/env bash

# Prevent the script from being sourced. If sourced, return an error instead
# of calling `exit` which would close the user's shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "This script is meant to be executed, not sourced. Run: bash $0 <slug> [--cli]" >&2
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

usage() {
  echo "Usage: $0 <slug> [--cli \"<command>\"]"
  exit 2
}

if [ $# -lt 1 ]; then
  usage
fi

cli=false
cli_cmd=""
slug=""

# Accept flags in any order. The first non-flag token is the slug.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cli)
      shift || true
      if [ "$#" -eq 0 ]; then
        echo "--cli requires a command argument" >&2
        usage
      fi
      cli=true
      cli_cmd="$1"
      shift || true
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      if [ -z "$slug" ]; then
        slug="$1"
        shift || true
      else
        echo "Unexpected argument: $1" >&2
        usage
      fi
      ;;
  esac
done

if [ -z "$slug" ]; then
  usage
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
projects_root="$repo_root/packages/core/test/fixtures/projects"
fixture_siren_dir="$projects_root/$slug/siren"

mkdir -p "$fixture_siren_dir"
printf 'Created fixture directory: %s\n' "$fixture_siren_dir"

if command -v siren >/dev/null 2>&1; then
  if (cd "$fixture_siren_dir" && siren init); then
    printf 'Initialized project with siren in %s\n' "$fixture_siren_dir"
  else
    printf 'siren init failed; creating fallback main.siren\n'
    printf "# %s fixture\n" "$slug" > "$fixture_siren_dir/main.siren"
  fi
else
  printf 'siren CLI not found; writing fallback main.siren\n'
  printf "# %s fixture\n" "$slug" > "$fixture_siren_dir/main.siren"
fi

if [ "$cli" = true ]; then
  expected_dir="$repo_root/apps/cli/test/expected"
  mkdir -p "$expected_dir"
  expected_path="$expected_dir/$slug.txt"
  if [ -e "$expected_path" ]; then
    printf 'Companion golden file already exists: %s\n' "$expected_path"
  else
    if [ "$cli" = true ]; then
      if [ -z "$cli_cmd" ]; then
        echo "--cli requires a command argument" >&2
        usage
      fi
      printf '# %s\n' "$cli_cmd" > "$expected_path"
    else
      printf '# Expected output for fixture %s\n' "$slug" > "$expected_path"
    fi
    printf 'Created companion CLI golden file: %s\n' "$expected_path"
  fi
fi

exit 0
