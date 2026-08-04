#!/usr/bin/env bash
#
# test.sh — Create a test branch to simulate the main userscript update experience,
#           or fork the current branch faithfully with --from-head / -f
#
# Usage:
#   ./utils/test.sh [--dry-run] [--from-head|-f] <new_branch_name>
#
# Options:
#   --dry-run       Print every change that would be made (fleet.user.js and git
#                   steps); do not modify anything.
#   --from-head, -f Keep the current branch's fleet.user.js (version and host
#                   logic); only remap branch-bound fields via sync-branch-config.sh.
#                   Default (without this flag) replaces fleet.user.js with main's.
#
# Arguments:
#   new_branch_name   Name for the new branch. Must not already exist locally or
#                     on origin, and cannot be "main".
#
# Effects (default):
#   1. Validates branch name (non-empty, not "main", valid ref format) and ensures
#      it does not exist locally or on origin. Requires a clean working tree.
#   2. Fetches origin/main. Creates the new branch from the current branch (so
#      modules and other files stay from the current branch).
#   3. Replaces fleet.user.js with the version from main, then runs sync-branch-config.sh
#      to update fleet.user.js for this branch (@name prefix, @downloadURL/@updateURL,
#      GITHUB_CONFIG.branch, VERSION).
#   4. Commits any sync changes (or no-op if already in sync) and pushes the
#      branch to origin.
#   5. Prints the raw fleet.user.js install URL and explains that this branch is for
#      testing how users on the current main script would experience an update before
#      releasing; install from the printed URL to find script-breaking issues.
#
# Effects (--from-head / -f):
#   Same as default except fleet.user.js is not replaced with main's copy; only
#   branch-bound fields are remapped. Also prints the DEV-ID install URL.
#
# Use default mode to validate an upcoming main release: install the test-branch
# script, use it as normal, then merge to main with publish.sh when satisfied.
# Use --from-head / -f for a temporary copy of the current feature branch.
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
Usage: test.sh [--dry-run] [--from-head|-f] NEW_BRANCH_NAME

  --dry-run       Print every change that would be made; do not modify anything.
  --from-head, -f Keep current fleet.user.js; only remap branch config (no main replace).
  NEW_BRANCH_NAME Name for the new branch (must not already exist locally or on origin).

Default: create branch from current HEAD, replace fleet.user.js with main's version,
sync for the new branch name, commit, and push. Use to test the update experience
before publishing to main.

With --from-head / -f: create branch from current HEAD, preserve fleet.user.js
content/version, sync branch-bound fields only, commit, and push.
EOF
}

dry_run=false
from_head=false
branch=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --from-head|-f)
      from_head=true
      shift
      ;;
    -*)
      echo "[error] Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -n "$branch" ]]; then
        echo "[error] Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      branch="$1"
      shift
      ;;
  esac
done

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

current_branch="$(git -C "$root" branch --show-current)"

if [[ "$dry_run" == true ]]; then
  if [[ "$from_head" == true ]]; then
    echo "[dry-run] Would create branch: $branch from current branch ($current_branch); keep fleet.user.js, then update branch config:"
    "$sync_script" --dry-run --branch "$branch"
    echo "[dry-run] Would run: git checkout -b $branch"
    echo "[dry-run] Would run: $sync_script"
    echo "[dry-run] Would run: git add ."
    echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
    echo "[dry-run] Would run: git push -u origin $branch"
    url="$(cd "$root" && gh browse --no-browser)"
    ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
    ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)(?:/|$)}')
    echo "[dry-run] Would print DEV-ID install URL: https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch/dev/fleet-dev-id.user.js"
    echo "[dry-run] Would print install URL: https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch/fleet.user.js"
  else
    echo "[info] Fetching main for dry-run..."
    git -C "$root" fetch origin main
    if ! git -C "$root" show origin/main:fleet.user.js >/dev/null 2>&1; then
      echo "[error] fleet.user.js not found on origin/main"
      exit 1
    fi
    tmp_fleet="$(mktemp)"
    trap 'rm -f "$tmp_fleet"' EXIT
    git -C "$root" show origin/main:fleet.user.js >"$tmp_fleet"
    echo "[dry-run] Would create branch: $branch from current branch ($current_branch); would replace fleet.user.js with main's, then update fleet.user.js:"
    "$sync_script" --dry-run --fleet "$tmp_fleet" --branch "$branch"
    echo "[dry-run] Would run: git fetch origin main"
    echo "[dry-run] Would run: git checkout -b $branch"
    echo "[dry-run] Would run: git checkout origin/main -- fleet.user.js"
    echo "[dry-run] Would run: $sync_script"
    echo "[dry-run] Would run: git add ."
    echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
    echo "[dry-run] Would run: git push -u origin $branch"
    url="$(cd "$root" && gh browse --no-browser)"
    ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
    ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)(?:/|$)}')
    echo "[dry-run] Would print install URL: https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch/fleet.user.js"
  fi
  exit 0
fi

if [[ "$from_head" != true ]]; then
  echo "[info] Fetching main..."
  git -C "$root" fetch origin main
fi

echo "[info] Creating branch: $branch from current branch ($current_branch)"
git -C "$root" checkout -b "$branch"

if [[ "$from_head" == true ]]; then
  echo "[info] Keeping fleet.user.js from $current_branch (from-head); syncing branch config only..."
else
  echo "[info] Replacing fleet.user.js with main's version..."
  git -C "$root" checkout origin/main -- fleet.user.js
  echo "[info] Syncing branch config in fleet.user.js..."
fi

(cd "$root" && "$sync_script")

git -C "$root" add .
if git -C "$root" diff --cached --quiet; then
  echo "[info] No changes after sync (already in sync); pushing anyway."
else
  git -C "$root" commit -m "Sync branch config for $branch"
fi

echo "[info] Pushing to origin..."
git -C "$root" push -u origin "$branch"

url="$(cd "$root" && gh browse --no-browser)"
ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)(?:/|$)}')
MAIN_INSTALL_URL="https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch/fleet.user.js"
DEV_ID_INSTALL_URL="https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch/dev/fleet-dev-id.user.js"

if [[ "$from_head" == true ]]; then
  echo "Branch $branch was created from $current_branch with fleet.user.js preserved (branch config remapped)."
  echo "Install DEV-ID userscript (raw):"
  echo "$DEV_ID_INSTALL_URL"
  echo "Install branch userscript (raw):"
  echo "$MAIN_INSTALL_URL"
else
  echo "The purpose of this step is to test how users on the current main userscript would experience the changes before updating their script to the current version."
  echo "If the incoming update introduces script breaking errors, this is where those would be identified."
  echo "Install the test userscript from:"
  echo "$MAIN_INSTALL_URL"
fi
