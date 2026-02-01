#!/usr/bin/env bash
# Create a new test branch from main with fleet.user.js synced for that branch and push to remote.
# Branch name must not exist locally or on origin.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: test.sh NEW_BRANCH_NAME

  NEW_BRANCH_NAME  Name for the new branch (must not already exist locally or on origin).

Creates the branch from main, copies main's fleet.user.js into it, runs sync-branch-config,
commits the changes, and pushes to origin.
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