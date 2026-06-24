#!/usr/bin/env bash
# For a given target @sirenpm/* package, replaces its `workspace:*`
# dependency handles with the resolved semver ranges from `yarn pack`,
# simulating what a consumer sees after publish.
#
# Usage: bash .github/workflow-utils/simulate-published-deps.sh <target-package>
#
# Example:
#   bash .github/workflow-utils/simulate-published-deps.sh @sirenpm/language
#   YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn install
#   YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn build
#   YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn test
#
# Packages with no @sirenpm/* dependencies (e.g. @sirenpm/core) are skipped
# with a no-op message — there is nothing to simulate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_PACKAGE="${1:?Usage: simulate-published-deps.sh <target-package>}"

# --- Resolve target to location and bail if unknown ---
TARGET_LOCATION=$(yarn workspaces list --json | jq -r \
  --arg name "$TARGET_PACKAGE" \
  'select(.name == $name and .location != ".") | .location')

if [ -z "$TARGET_LOCATION" ]; then
  echo "::error::Unknown or private package: $TARGET_PACKAGE. Verify it is a public @sirenpm/* workspace listed in \`yarn workspaces list\`."
  exit 1
fi

TARGET_PKG_JSON="$REPO_ROOT/$TARGET_LOCATION/package.json"

# --- Check whether target has any @sirenpm/* dependencies ---
HAS_SIREN_DEPS=$(jq -r \
  '[.dependencies // {} | keys[] | select(startswith("@sirenpm/"))] | length > 0' \
  "$TARGET_PKG_JSON")

if [ "$HAS_SIREN_DEPS" != "true" ]; then
  echo "Package $TARGET_PACKAGE has no @sirenpm/* dependencies — nothing to simulate. Skipping."
  exit 0
fi

PACK_DIR=$(mktemp -d)
trap 'rm -rf "$PACK_DIR"' EXIT

# --- Step 1: Pack the target workspace and extract resolved dependency versions ---
echo "Packing $TARGET_PACKAGE to extract resolved dependency versions ..."
tarball="$PACK_DIR/pkg.tgz"
yarn workspace "$TARGET_PACKAGE" pack --out "$tarball" 2>/dev/null

tar -xzf "$tarball" -C "$PACK_DIR" "package/package.json"

declare -A RESOLVED_DEPS
while IFS='=' read -r dep_name dep_version; do
  RESOLVED_DEPS["$dep_name"]="$dep_version"
  echo "  $dep_name -> $dep_version"
done < <(jq -r '.dependencies // {} | to_entries[] | select(.key | startswith("@sirenpm/")) | "\(.key)=\(.value)"' "$PACK_DIR/package/package.json")

rm -f "$tarball" "$PACK_DIR/package/package.json"
rmdir "$PACK_DIR/package" 2>/dev/null || true

if [ ${#RESOLVED_DEPS[@]} -eq 0 ]; then
  echo "::notice::No @sirenpm/* cross-dependencies found in packed $TARGET_PACKAGE. Nothing to replace."
  exit 0
fi

# --- Step 2: Replace workspace:* deps in the target's package.json ---
echo ""
echo "Replacing workspace:* deps in $TARGET_LOCATION/package.json ..."
for dep_name in "${!RESOLVED_DEPS[@]}"; do
  resolved="${RESOLVED_DEPS[$dep_name]}"
  escaped_name=$(printf '%s\n' "$dep_name" | sed 's/[\/@\\]/\\&/g')
  perl -i -pe "s#\"${escaped_name}\"\s*:\s*\"workspace:\*\"#\"${dep_name}\": \"${resolved}\"#g" "$TARGET_PKG_JSON"
  echo "  $TARGET_PACKAGE: $dep_name -> $resolved"
done

echo ""
echo "Done. Run the following to verify post-pack behavior for $TARGET_PACKAGE:"
echo "  YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn install"
echo "  YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn workspace $TARGET_PACKAGE build"
echo "  YARN_ENABLE_TRANSPARENT_WORKSPACES=false yarn workspace $TARGET_PACKAGE test"
