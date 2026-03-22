#!/bin/bash
#
# delete-branch.sh — Delete a branch locally and on origin
#
# Usage:
#   ./utils/delete-branch.sh <branch>
#
# Arguments:
#   branch   Name of the branch to delete.
#
# Effects:
#   Checks out main, deletes the branch locally (git branch -D) and on origin
#   (git push --delete), then runs git pull on main. Deletion errors are
#   ignored; both deletions are attempted even if the branch does not exist in
#   one or both places. Pull failures exit non-zero (set -e).
#
# Safety:
#   The script refuses to delete the branch "main" (any casing) and exits with
#   status 1 before running any delete commands.
#

set -e

branch="${1:?Usage: $0 <branch>}"

# Never delete main (case-insensitive). Check before any git commands.
branch_lower=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]')
if [[ "$branch_lower" == "main" ]]; then
  echo "delete-branch.sh: refusing to delete protected branch 'main'" >&2
  exit 1
fi

git checkout main
git branch -D "$branch" 2>/dev/null || true
git push origin --delete "$branch" 2>/dev/null || true
git pull
