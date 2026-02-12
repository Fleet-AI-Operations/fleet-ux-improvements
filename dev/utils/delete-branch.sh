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
#   Deletes the branch locally (git branch -D) and on origin (git push --delete).
#   Errors are ignored; both deletions are attempted even if the branch does
#   not exist in one or both places.
#

set -e

git checkout main

branch="${1:?Usage: $0 <branch>}"

git checkout main
git branch -D "$branch" 2>/dev/null || true
git push origin --delete "$branch" 2>/dev/null || true
