#!/usr/bin/env bash
#
# test.sh — Create a test branch to simulate the main userscript update experience
#
# Usage:
#   ./utils/test.sh [--dry-run] <new_branch_name>
#
# Options:
#   --dry-run  Print every change that would be made (fleet.user.js and git steps); do not modify anything.
#
# Arguments:
#   new_branch_name   Name for the new branch. Must not already exist locally or
#                     on origin, and cannot be "main".
#
# Effects:
#   1. Validates branch name (non-empty, not "main", valid ref format) and ensures
#      it does not exist locally or on origin. Requires a clean working tree.
#   2. Fetches origin/main. Creates the new branch from the current branch (so
#      modules and other files stay from the current branch).
#   3. Replaces fleet.user.js with the version from main, then runs sync-branch-config.sh
#      to update fleet.user.js for this branch (@name prefix, @downloadURL/@updateURL,
#      GITHUB_CONFIG.branch, VERSION).
#   4. Commits any sync changes (or no-op if already in sync) and pushes the
#      branch to origin.
#   5. Prints the GitHub tree URL and explains that this branch is for testing
#      how users on the current main script would experience an update before
#      releasing; install from the printed URL to find script-breaking issues.
#
# Use this to validate an upcoming main release: install the test-branch script,
# use it as normal, then merge to main with publish.sh when satisfied.
#
# Prerequisites: run from anywhere inside the repo; sync-branch-config.sh must exist
# in the same directory (utils/). Working tree must be clean.
#

set -euo pipefail

# Repo root from script location (use git so scripts in utils/ or dev/utils/ both work)
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
sync_script="$script_dir/sync-branch-config.sh"
if [[ ! -f "$sync_script" ]]; then
  echo "[error] sync-branch-config.sh not found: $sync_script" >&2
  exit 1
fi

usage() {
  cat <<'EOF'
Usage: test.sh [--dry-run] NEW_BRANCH_NAME

  --dry-run       Print every change that would be made; do not modify anything.
  NEW_BRANCH_NAME Name for the new branch (must not already exist locally or on origin).

Creates the branch from the current branch (modules from current branch), replaces
fleet.user.js with main's version, syncs fleet.user.js for the new branch via
sync-branch-config.sh, commits any changes, and pushes to origin. Install the script
from the printed URL to test the update experience before publishing to main.
EOF
}

dry_run=false
branch=""
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
  branch="${2:-}"
else
  branch="${1:-}"
fi
if [[ -z "${branch// }" ]]; then
  echo "[error] Branch name required (cannot be empty)"
  usage
  exit 1
fi

if [[ "$branch" == main ]]; then
  echo "[error] Branch name cannot be 'main'"
  exit 1
fi

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "[error] Invalid branch name: $branch"
  exit 1
fi

if git -C "$root" show-ref --verify "refs/heads/$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists locally: $branch"
  exit 1
fi

if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists on origin: $branch"
  exit 1
fi

if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
  echo "[error] Working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

if [[ "$dry_run" == true ]]; then
  echo "[info] Fetching main for dry-run..."
  git -C "$root" fetch origin main
  if ! git -C "$root" show origin/main:fleet.user.js >/dev/null 2>&1; then
    echo "[error] fleet.user.js not found on origin/main"
    exit 1
  fi
  tmp_fleet="$(mktemp)"
  trap 'rm -f "$tmp_fleet"' EXIT
  git -C "$root" show origin/main:fleet.user.js >"$tmp_fleet"
  current_branch="$(git -C "$root" branch --show-current)"
  echo "[dry-run] Would create branch: $branch from current branch ($current_branch); would replace fleet.user.js with main's, then update fleet.user.js:"
  "$sync_script" --dry-run --fleet "$tmp_fleet" --branch "$branch"
  echo "[dry-run] Would run: git fetch origin main"
  echo "[dry-run] Would run: git checkout -b $branch"
  echo "[dry-run] Would run: git checkout origin/main -- fleet.user.js"
  echo "[dry-run] Would run: $sync_script"
  echo "[dry-run] Would run: git add ."
  echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
  echo "[dry-run] Would run: git push -u origin $branch"
  exit 0
fi

echo "[info] Fetching main..."
git -C "$root" fetch origin main

current_branch="$(git -C "$root" branch --show-current)"
echo "[info] Creating branch: $branch from current branch ($current_branch)"
git -C "$root" checkout -b "$branch"

echo "[info] Replacing fleet.user.js with main's version..."
git -C "$root" checkout origin/main -- fleet.user.js

echo "[info] Syncing branch config in fleet.user.js..."
(cd "$root" && "$sync_script")

git -C "$root" add .
if git -C "$root" diff --cached --quiet; then
  echo "[info] No changes after sync (already in sync); pushing anyway."
else
  git -C "$root" commit -m "Sync branch config for $branch"
fi

echo "[info] Pushing to origin..."
git -C "$root" push -u origin "$branch"

url="$(cd "$root" && gh browse --no-browser "$branch")"
ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)/}')
ghfile=$(echo "$url" | perl -nE 'say $1 if m{tree/[^/]+/(.+)}')
GITHUB_URL="https://github.com/$ghuser/$ghrepo/tree/$branch/$ghfile"

echo "The purpose of this step is to test how users on the current main userscript would experience the changes before updating their script to the current version."
echo "If the incoming update introduces script breaking errors, this is where those would be identified."
echo "Install the test userscript from:"
echo "$GITHUB_URL"