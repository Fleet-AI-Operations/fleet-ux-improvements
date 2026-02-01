#!/usr/bin/env bash
#
# test.sh — Create a test branch to simulate the main userscript update experience
#
# Usage:
#   ./utils/test.sh <new_branch_name>
#
# Arguments:
#   new_branch_name   Name for the new branch. Must not already exist locally or
#                     on origin, and cannot be "main".
#
# Effects:
#   1. Validates branch name (non-empty, not "main", valid ref format) and ensures
#      it does not exist locally or on origin. Requires a clean working tree.
#   2. Fetches origin/main, checks out main, and creates the new branch.
#   3. Runs sync-branch-config.sh to update fleet.user.js for this branch (@name
#      prefix, @downloadURL/@updateURL, GITHUB_CONFIG.branch, VERSION).
#   4. Commits any sync changes (or no-op if already in sync) and pushes the
#      branch to origin.
#   5. Prints the GitHub tree URL and explains that this branch is for testing
#      how users on the current main script would experience an update before
#      releasing; install from the printed URL to find script-breaking issues.
#
# Use this to validate an upcoming main release: install the test-branch script,
# use it as normal, then merge to main with publish.sh when satisfied.
#
# Prerequisites: run from repo root or utils/; sync-branch-config.sh must exist
# in the same directory (utils/). Working tree must be clean.
#

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: test.sh NEW_BRANCH_NAME

  NEW_BRANCH_NAME  Name for the new branch (must not already exist locally or on origin).

Creates the branch from main, syncs fleet.user.js for that branch via sync-branch-config.sh,
commits any changes, and pushes to origin. Install the script from the printed URL to
test the update experience before publishing to main.
EOF
}

if [[ $# -ne 1 ]]; then
  echo "[error] Exactly one argument (new branch name) required"
  usage
  exit 1
fi

branch="$1"
if [[ -z "${branch// }" ]]; then
  echo "[error] Branch name cannot be empty"
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

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"

cd "$root"

if git show-ref --verify "refs/heads/$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists locally: $branch"
  exit 1
fi

if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists on origin: $branch"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[error] Working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

echo "[info] Fetching main..."
git fetch origin main

echo "[info] Checking out main..."
git checkout main

echo "[info] Creating branch: $branch"
git checkout -b "$branch"

echo "[info] Syncing branch config in fleet.user.js..."
"$script_dir/sync-branch-config.sh"

git add .
if git diff --cached --quiet; then
  echo "[info] No changes after sync (already in sync); pushing anyway."
else
  git commit -m "Sync branch config for $branch"
fi

echo "[info] Pushing to origin..."
git push -u origin "$branch"

url=$(gh browse --no-browser "$1") 
ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}') 
ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)/}') 
ghfile=$(echo "$url" | perl -nE 'say $1 if m{tree/[^/]+/(.+)}') 
GITHUB_URL="https://github.com/$ghuser/$ghrepo/tree/$branch/$ghfile"

echo "The purpose of this step is to test how users on the current main userscript would experience the changes before updating their script to the current version."
echo "If the incoming update introduces script breaking errors, this is where those would be identified."
echo "Install the test userscript from:"
echo "$GITHUB_URL"