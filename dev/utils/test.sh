#!/usr/bin/env bash
#
# test.sh — Create a test branch to simulate the main userscript update experience,
#           fork the current branch faithfully with --from-head / -f, or copy
#           fleet.user.js from one existing branch onto another with --from-branch / -F
#
# Usage:
#   ./utils/test.sh [--dry-run] [--from-head|-f] <new_branch_name>
#   ./utils/test.sh [--dry-run] --from-branch|-F <origin_branch> <target_branch>
#
# Options:
#   --dry-run              Print every change that would be made (fleet.user.js and git
#                          steps); do not modify anything.
#   --from-head, -f        Keep the current branch's fleet.user.js (version and host
#                          logic); only remap branch-bound fields via sync-branch-config.sh.
#                          Default (without this flag) replaces fleet.user.js with main's.
#   --from-branch, -F      Copy fleet.user.js from an existing <origin_branch> onto an
#                          existing <target_branch>, remap branch-bound fields for the
#                          target, commit, and push. Does not create a branch.
#                          Mutually exclusive with --from-head / -f.
#
# Arguments (default / --from-head):
#   new_branch_name   Name for the new branch. Must not already exist locally or
#                     on origin, and cannot be "main".
#
# Arguments (--from-branch / -F):
#   origin_branch     Existing branch whose fleet.user.js to copy (local or origin/<name>).
#   target_branch     Existing branch to receive the copy (local or origin/<name>).
#                     Cannot be "main".
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
# Effects (--from-branch / -F):
#   1. Validates both branches exist (local and/or origin after best-effort fetch).
#      Requires a clean working tree. Does not create any branch.
#   2. Checks out target, replaces fleet.user.js with origin's copy, runs
#      sync-branch-config.sh for the target name, commits if needed, pushes.
#   3. Checks out the branch that was current when the script started.
#   4. Prints the target install URL so an already-installed test script can update.
#
# Use default mode to validate an upcoming main release: install the test-branch
# script, use it as normal, then merge to main with publish.sh when satisfied.
# Use --from-head / -f for a temporary copy of the current feature branch.
# Use --from-branch / -F after default mode: copy an updated fleet.user.js from the
# feature branch onto the existing test branch so Tampermonkey's natural update
# flow can bring the installed host fully up to date.
#
# Prerequisites: run from anywhere inside the repo; sync-branch-config.sh must exist
# in the same directory (utils/). Working tree must be clean (except --dry-run).
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
Usage:
  test.sh [--dry-run] [--from-head|-f] NEW_BRANCH_NAME
  test.sh [--dry-run] --from-branch|-F ORIGIN_BRANCH TARGET_BRANCH

  --dry-run              Print every change that would be made; do not modify anything.
  --from-head, -f        Keep current fleet.user.js; only remap branch config (no main replace).
  --from-branch, -F      Copy fleet.user.js from existing ORIGIN_BRANCH onto existing
                         TARGET_BRANCH, remap branch config, commit, and push.
                         Does not create a branch.
  NEW_BRANCH_NAME        Name for the new branch (must not already exist locally or on origin).
  ORIGIN_BRANCH          Existing branch to take fleet.user.js from (local or origin/<name>).
  TARGET_BRANCH          Existing branch to receive the copy (cannot be main).

Default: create branch from current HEAD, replace fleet.user.js with main's version,
sync for the new branch name, commit, and push. Use to test the update experience
before publishing to main.

With --from-head / -f: create branch from current HEAD, preserve fleet.user.js
content/version, sync branch-bound fields only, commit, and push.

With --from-branch / -F: copy fleet.user.js from ORIGIN onto TARGET (both must already
exist), sync for TARGET, commit, push, and return to the previous branch. Use after
default mode to push an updated host onto the test branch for Tampermonkey's update flow.
EOF
}

# Resolve a branch name to a tree-ish that has fleet.user.js (local preferred, else origin/).
resolve_fleet_source_ref() {
  local name="$1"
  if git -C "$root" show-ref --verify "refs/heads/$name" >/dev/null 2>&1; then
    if git -C "$root" cat-file -e "$name:fleet.user.js" 2>/dev/null; then
      printf '%s\n' "$name"
      return 0
    fi
  fi
  if git -C "$root" rev-parse --verify "origin/$name" >/dev/null 2>&1; then
    if git -C "$root" cat-file -e "origin/$name:fleet.user.js" 2>/dev/null; then
      printf '%s\n' "origin/$name"
      return 0
    fi
  fi
  return 1
}

# True if branch exists locally or as origin/<name>.
branch_exists() {
  local name="$1"
  git -C "$root" show-ref --verify "refs/heads/$name" >/dev/null 2>&1 \
    || git -C "$root" rev-parse --verify "origin/$name" >/dev/null 2>&1
}

# Checkout an existing branch; create local tracking from origin/<name> if needed.
checkout_existing_branch() {
  local name="$1"
  if git -C "$root" show-ref --verify "refs/heads/$name" >/dev/null 2>&1; then
    git -C "$root" checkout "$name"
  elif git -C "$root" rev-parse --verify "origin/$name" >/dev/null 2>&1; then
    git -C "$root" checkout --track "origin/$name"
  else
    echo "[error] Branch does not exist locally or on origin: $name" >&2
    exit 1
  fi
}

# Sets MAIN_INSTALL_URL and DEV_ID_INSTALL_URL for the given branch.
set_install_urls() {
  local branch_name="$1"
  local url ghuser ghrepo origin_url
  ghuser=""
  ghrepo=""
  if url="$(cd "$root" && gh browse --no-browser 2>/dev/null)"; then
    ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}')
    ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)(?:/|$)}')
  fi
  if [[ -z "$ghuser" || -z "$ghrepo" ]]; then
    origin_url="$(git -C "$root" remote get-url origin 2>/dev/null || true)"
    ghuser=$(printf '%s' "$origin_url" | perl -ne 'if (m{github\.com[:/]([^/]+)/([^/.]+)(?:\.git)?\s*$}i) { print $1; exit }')
    ghrepo=$(printf '%s' "$origin_url" | perl -ne 'if (m{github\.com[:/]([^/]+)/([^/.]+)(?:\.git)?\s*$}i) { print $2; exit }')
  fi
  MAIN_INSTALL_URL="https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch_name/fleet.user.js"
  DEV_ID_INSTALL_URL="https://raw.githubusercontent.com/$ghuser/$ghrepo/$branch_name/dev/fleet-dev-id.user.js"
}

dry_run=false
from_head=false
from_branch=false
fleet_origin=""
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
    --from-branch|-F)
      from_branch=true
      if [[ $# -lt 3 ]]; then
        echo "[error] --from-branch / -F requires ORIGIN_BRANCH and TARGET_BRANCH" >&2
        usage
        exit 1
      fi
      fleet_origin="$2"
      branch="$3"
      shift 3
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

if [[ "$from_head" == true && "$from_branch" == true ]]; then
  echo "[error] --from-head / -f and --from-branch / -F are mutually exclusive" >&2
  usage
  exit 1
fi

if [[ -z "${branch// }" ]]; then
  echo "[error] Branch name required (cannot be empty)"
  usage
  exit 1
fi

if [[ "$from_branch" == true && -z "${fleet_origin// }" ]]; then
  echo "[error] Origin branch name required with --from-branch / -F (cannot be empty)"
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

if [[ "$from_branch" == true ]]; then
  if ! git check-ref-format --branch "$fleet_origin" >/dev/null 2>&1; then
    echo "[error] Invalid origin branch name: $fleet_origin"
    exit 1
  fi
  if [[ "$fleet_origin" == "$branch" ]]; then
    echo "[error] Origin and target branch must differ"
    exit 1
  fi
fi

if [[ "$dry_run" != true ]]; then
  if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
    echo "[error] Working tree has uncommitted changes. Commit or stash them first."
    exit 1
  fi
fi

current_branch="$(git -C "$root" branch --show-current)"

# ---------------------------------------------------------------------------
# --from-branch / -F: copy fleet onto an existing target (never create)
# ---------------------------------------------------------------------------
if [[ "$from_branch" == true ]]; then
  echo "[info] Fetching origin refs for $fleet_origin and $branch..."
  git -C "$root" fetch origin "$fleet_origin" 2>/dev/null || true
  git -C "$root" fetch origin "$branch" 2>/dev/null || true
  git -C "$root" fetch origin 2>/dev/null || true

  if ! branch_exists "$fleet_origin"; then
    echo "[error] Origin branch does not exist locally or on origin: $fleet_origin"
    exit 1
  fi
  if ! branch_exists "$branch"; then
    echo "[error] Target branch does not exist locally or on origin: $branch"
    exit 1
  fi

  if ! fleet_source_ref="$(resolve_fleet_source_ref "$fleet_origin")"; then
    echo "[error] fleet.user.js not found on branch: $fleet_origin (tried local and origin/$fleet_origin)"
    exit 1
  fi

  if [[ "$dry_run" == true ]]; then
    tmp_fleet="$(mktemp)"
    trap 'rm -f "$tmp_fleet"' EXIT
    git -C "$root" show "$fleet_source_ref:fleet.user.js" >"$tmp_fleet"
    echo "[dry-run] Would copy fleet.user.js from $fleet_source_ref onto existing branch $branch, then update branch config:"
    "$sync_script" --dry-run --fleet "$tmp_fleet" --branch "$branch"
    echo "[dry-run] Would run: git checkout $branch (or track origin/$branch)"
    echo "[dry-run] Would run: git checkout $fleet_source_ref -- fleet.user.js"
    echo "[dry-run] Would run: $sync_script"
    echo "[dry-run] Would run: git add ."
    echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
    echo "[dry-run] Would run: git push origin $branch"
    if [[ -n "$current_branch" && "$current_branch" != "$branch" ]]; then
      echo "[dry-run] Would run: git checkout $current_branch"
    fi
    set_install_urls "$branch"
    echo "[dry-run] Would print install URL: $MAIN_INSTALL_URL"
    echo "[dry-run] An already-installed script for $branch should pick this up via Tampermonkey update."
    exit 0
  fi

  echo "[info] Checking out existing target branch: $branch"
  checkout_existing_branch "$branch"

  echo "[info] Replacing fleet.user.js with $fleet_source_ref's version..."
  git -C "$root" checkout "$fleet_source_ref" -- fleet.user.js
  echo "[info] Syncing branch config in fleet.user.js for $branch..."
  (cd "$root" && "$sync_script")

  git -C "$root" add .
  if git -C "$root" diff --cached --quiet; then
    echo "[info] No changes after sync (already in sync); pushing anyway."
  else
    git -C "$root" commit -m "Sync branch config for $branch"
  fi

  echo "[info] Pushing $branch to origin..."
  git -C "$root" push origin "$branch"

  if [[ -n "$current_branch" && "$current_branch" != "$branch" ]]; then
    echo "[info] Returning to $current_branch..."
    git -C "$root" checkout "$current_branch"
  fi

  set_install_urls "$branch"
  echo "Copied fleet.user.js from $fleet_source_ref onto $branch (branch config remapped) and pushed."
  echo "If you already installed the $branch userscript, check for updates in Tampermonkey to exercise the natural update flow."
  echo "Install / update URL (raw):"
  echo "$MAIN_INSTALL_URL"
  exit 0
fi

# ---------------------------------------------------------------------------
# Create mode (default / --from-head): new branch must not exist
# ---------------------------------------------------------------------------
if git -C "$root" show-ref --verify "refs/heads/$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists locally: $branch"
  exit 1
fi

if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "[error] Branch already exists on origin: $branch"
  exit 1
fi

if [[ "$dry_run" == true ]]; then
  if [[ "$from_head" == true ]]; then
    echo "[dry-run] Would create branch: $branch from current branch ($current_branch); keep fleet.user.js, then update branch config:"
    "$sync_script" --dry-run --branch "$branch"
    echo "[dry-run] Would run: git checkout -b $branch"
    echo "[dry-run] Would run: $sync_script"
    echo "[dry-run] Would run: git add ."
    echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
    echo "[dry-run] Would run: git push -u origin $branch"
    set_install_urls "$branch"
    echo "[dry-run] Would print DEV-ID install URL: $DEV_ID_INSTALL_URL"
    echo "[dry-run] Would print install URL: $MAIN_INSTALL_URL"
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
    set_install_urls "$branch"
    echo "[dry-run] Would print install URL: $MAIN_INSTALL_URL"
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

set_install_urls "$branch"

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
