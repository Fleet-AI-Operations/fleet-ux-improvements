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
# Prerequisites: run from anywhere inside the repo; sync-branch-config.sh must exist
# in the same directory (utils/). Working tree must be clean.
#

set -euo pipefail

# Repo root from script location (use git so scripts in utils/ or dev/utils/ both work)
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"

usage() {
  cat <<'EOF'
Usage: test.sh [--dry-run] NEW_BRANCH_NAME

  --dry-run       Print every change that would be made; do not modify anything.
  NEW_BRANCH_NAME Name for the new branch (must not already exist locally or on origin).

Creates the branch from main, syncs fleet.user.js for that branch via sync-branch-config.sh,
commits any changes, and pushes to origin. Install the script from the printed URL to
test the update experience before publishing to main.
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
  echo "[error] Branch name required"
  usage
  exit 1
fi
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
  file_path="$root/fleet.user.js"
  if [[ ! -f "$file_path" ]]; then
    echo "[error] fleet.user.js not found: $file_path"
    exit 1
  fi
  header_version="$(awk '/^\/\/ @version[[:space:]]+/ {print $3; exit}' "$file_path")"
  if [[ -z "$header_version" ]]; then
    echo "[error] Could not find @version in header"
    exit 1
  fi
  needs_name_change() {
    BRANCH="$branch" perl -0ne '
      if (/^\/\/ \@name\s+(\[[^\]]+\]\s+)?(.+?)(?:\r?\n|\z)/m) {
        my ($tag, $name) = ($1, $2);
        $name =~ s/^\s+|\s+$//g;
        if ($ENV{BRANCH} eq "main") { print($tag ? "1" : "0"); } else {
          my $expected = "[" . $ENV{BRANCH} . "] ";
          print((!defined $tag || $tag ne $expected) ? "1" : "0");
        }
      }
    ' "$file_path"
  }
  needs_download_url_change() { BRANCH="$branch" perl -0ne 'if (/^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) { print($1 ne $ENV{BRANCH} ? "1" : "0"); }' "$file_path"; }
  needs_update_url_change() { BRANCH="$branch" perl -0ne 'if (/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) { print($1 ne $ENV{BRANCH} ? "1" : "0"); }' "$file_path"; }
  needs_github_config_change() { BRANCH="$branch" perl -0ne 'if (/branch:\s*[\"\x27]([^\"\x27]+)[\"\x27]/) { print($1 ne $ENV{BRANCH} ? "1" : "0"); }' "$file_path"; }
  needs_version_constant_change() { HEADER_VERSION="$header_version" perl -0ne 'if (/const VERSION\s*=\s*[\"\x27]([^\"\x27]+)[\"\x27]/) { print($1 ne $ENV{HEADER_VERSION} ? "1" : "0"); }' "$file_path"; }
  name_change="$(needs_name_change)"
  download_change="$(needs_download_url_change)"
  update_change="$(needs_update_url_change)"
  github_change="$(needs_github_config_change)"
  version_change="$(needs_version_constant_change)"
  content="$(cat "$file_path")"
  new_content="$(printf "%s" "$content" | BRANCH="$branch" HEADER_VERSION="$header_version" perl -0pe '
    s{(// \@name\s+)(\[[^\]]+\]\s+)?(.+?)(\r?\n|\z)}{
      my ($p, $tag, $name, $eol) = ($1, $2, $3, $4);
      $name =~ s/^\s+|\s+$//g;
      ($ENV{BRANCH} eq "main" ? $p . $name : $p . "[" . $ENV{BRANCH} . "] " . $name) . $eol
    }mge;
    s{(// @(?:download|update)URL\s+https://raw\.githubusercontent\.com/[^/]+/[^/]+/)([^/]+)(/fleet\.user\.js)}{$1.$ENV{BRANCH}.$3}ge;
    s{(branch:\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1.$ENV{BRANCH}.$3}ge;
    s{(const VERSION\s*=\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1.$ENV{HEADER_VERSION}.$3}ge;
  ')"
  print_fleet_changes() {
    local c="$1" n="$2"
    if [[ "$name_change" == "1" ]]; then
      cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      echo "  fleet.user.js: @name: \"$cur\" -> \"$new\""
    fi
    if [[ "$download_change" == "1" ]]; then
      cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      echo "  fleet.user.js: @downloadURL: \"$cur\" -> \"$new\""
    fi
    if [[ "$update_change" == "1" ]]; then
      cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      echo "  fleet.user.js: @updateURL: \"$cur\" -> \"$new\""
    fi
    if [[ "$github_change" == "1" ]]; then
      cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /branch:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      new="$(printf '%s' "$n" | perl -0ne 'print $1 if /branch:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      echo "  fleet.user.js: GITHUB_CONFIG.branch: \"$cur\" -> \"$new\""
    fi
    if [[ "$version_change" == "1" ]]; then
      cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /const VERSION\s*=\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      new="$(printf '%s' "$n" | perl -0ne 'print $1 if /const VERSION\s*=\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      echo "  fleet.user.js: const VERSION: \"$cur\" -> \"$new\""
    fi
  }
  changed=()
  [[ "$name_change" == "1" ]] && changed+=("@name")
  [[ "$download_change" == "1" ]] && changed+=("@downloadURL")
  [[ "$update_change" == "1" ]] && changed+=("@updateURL")
  [[ "$github_change" == "1" ]] && changed+=("GITHUB_CONFIG.branch")
  [[ "$version_change" == "1" ]] && changed+=("VERSION constant")
  echo "[dry-run] Would create branch: $branch from main; would update fleet.user.js:"
  if [[ "${#changed[@]}" -gt 0 ]]; then
    print_fleet_changes "$content" "$new_content"
  else
    echo "  (no changes - already in sync for branch $branch)"
  fi
  echo "[dry-run] Would run: git fetch origin main"
  echo "[dry-run] Would run: git checkout main"
  echo "[dry-run] Would run: git checkout -b $branch"
  echo "[dry-run] Would run: sync-branch-config.sh (or apply above fleet.user.js changes)"
  echo "[dry-run] Would run: git add ."
  echo "[dry-run] Would run: git commit -m \"Sync branch config for $branch\""
  echo "[dry-run] Would run: git push -u origin $branch"
  exit 0
fi

echo "[info] Fetching main..."
git -C "$root" fetch origin main

echo "[info] Checking out main..."
git -C "$root" checkout main

echo "[info] Creating branch: $branch"
git -C "$root" checkout -b "$branch"

echo "[info] Syncing branch config in fleet.user.js..."
(cd "$root" && "$script_dir/sync-branch-config.sh")

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