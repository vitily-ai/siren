#!/usr/bin/env bash

# Prevent the script from being sourced.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "This script is meant to be executed, not sourced. Run: bash $0 <golden-file-name> <project-fixture-name> <siren-cli-to-run>" >&2
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

usage() {
  echo "Usage: $0 <golden-file-name> <project-fixture-name> <siren-cli-to-run>"
  echo "Example: $0 new-gold broken \"siren list -t\""
  exit 2
}

if [ $# -ne 3 ]; then
  usage
fi

golden_name="$1"
fixture_name="$2"
cli_cmd="$3"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
expected_dir="$repo_root/apps/cli/test/expected"
fixture_dir="$repo_root/packages/core/test/fixtures/projects/$fixture_name"

if [ ! -d "$fixture_dir" ]; then
  echo "Fixture '$fixture_name' does not exist at $fixture_dir" >&2
  exit 1
fi

# Create temp dir
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

# Copy fixture to temp
cp -r "$fixture_dir" "$temp_dir"

# Cd to the project root
project_dir="$temp_dir/$(basename "$fixture_dir")"
cd "$project_dir"

# Run the command and capture output
if output=$(eval "$cli_cmd" 2>&1); then
  # Success, stdout
  expected_file="$expected_dir/$golden_name.txt"
  exit_code=0
else
  # Failure, stderr
  expected_file="$expected_dir/$golden_name.err.txt"
  exit_code=$?
fi

# Write the frontmatter
cat > "$expected_file" <<EOF
{
	"fixture": "$fixture_name",
	"command": "$cli_cmd"
}
---
EOF

# Append the output
echo "$output" >> "$expected_file"

echo "Created golden file: $expected_file"

exit 0