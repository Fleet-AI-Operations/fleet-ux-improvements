#!/bin/bash
#
# checkout.sh — Create a feature branch and sync fleet.user.js for branch-specific installs
#
# Usage:
#   ./utils/checkout.sh [--dry-run] <branch>
#
# Options:
#   --dry-run  Print every change that would be made (fleet.user.js and git steps); do not modify anything.
#
# Arguments:
#   branch   Name of the new branch to create (must not already exist).
#
# Effects:
#   1. Checks out main and creates a new branch with the given name.
#   2. Updates fleet.user.js so it targets this branch:
#      - @name: prefixed with "[<branch>] " (e.g. "[my-feature] Fleet").
#      - @downloadURL / @updateURL: branch segment set to <branch> so Tampermonkey
#        installs/updates from the branch-specific raw URL.
#      - GITHUB_CONFIG.branch: set to <branch> for in-script behaviour.
#      - VERSION: kept in sync with the header @version.
#   3. Commits these changes with message "Sync branch config" and pushes the new
#      branch to origin.
#   4. Prints the GitHub tree URL for the branch so you can install the branch-specific
#      userscript for development and testing.
#
# Use this when starting work on a feature: install the script from the printed URL
# and develop against that branch; publish.sh merges the branch into main when done.
#
# Prerequisites: run from anywhere inside the repo; main must exist; branch name
# must not exist locally or on origin.
#

set -e

# Repo root from script location (use git so scripts in utils/ or dev/utils/ both work)
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"

dry_run=false
BRANCH=""
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
  BRANCH="${2:-}"
else
  BRANCH="${1:-}"
fi
if [[ -z "$BRANCH" ]]; then
  echo "Usage: $0 [--dry-run] <branch>"
  exit 1
fi

sync_script="$script_dir/sync-branch-config.sh"
if [[ ! -f "$sync_script" ]]; then
  echo "[error] sync-branch-config.sh not found: $sync_script" >&2
  exit 1
fi

if [[ "$dry_run" == true ]]; then
  echo "[info] Dry run - would create branch: $BRANCH (no git or file changes)"
  "$sync_script" --dry-run --branch "$BRANCH"
  echo "[dry-run] Would run: git checkout main"
  echo "[dry-run] Would run: git checkout -b $BRANCH"
  echo "[dry-run] Would run: $sync_script"
  echo "[dry-run] Would run: git add ."
  echo "[dry-run] Would run: git commit -m \"Sync branch config\""
  echo "[dry-run] Would run: git push -u origin $BRANCH"
  exit 0
fi

git -C "$root" checkout main
git -C "$root" checkout -b "$BRANCH"
echo "[info] Current branch: $(git -C "$root" rev-parse --abbrev-ref HEAD)"

"$sync_script"

git -C "$root" add .
git -C "$root" commit -m "Sync branch config"
git -C "$root" push -u origin "$BRANCH"

url="$(cd "$root" && gh browse --no-browser "$BRANCH")"
ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)(?:/|$)}')
RAW_INSTALL_URL="https://raw.githubusercontent.com/$ghuser/$ghrepo/$BRANCH/fleet.user.js"
BLOB_URL="https://github.com/$ghuser/$ghrepo/blob/$BRANCH/fleet.user.js"

echo "You MUST test and develop using this $BRANCH specific userscript."
echo "View on GitHub:"
echo "$BLOB_URL"
echo "Install it at (raw):"
echo "$RAW_INSTALL_URL"