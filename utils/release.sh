#!/bin/bash
#
# release.sh — Merge a feature branch into main and remove the branch
#
# Usage:
#   ./utils/release.sh [--dry-run] <branch>
#
# Options:
#   --dry-run  Print every change that would be made (merge, fleet.user.js, git steps); do not modify anything.
#
# Arguments:
#   branch   Name of the existing branch to merge into main (must exist locally
#            and on origin).
#
# Effects:
#   1. Checks that the branch exists locally and on origin, then checks out main
#      and merges <branch> into main (no ff requirement).
#   2. Updates fleet.user.js for main: @name without branch prefix, @downloadURL /
#      @updateURL pointing at main, GITHUB_CONFIG.branch set to "main", VERSION
#      in sync with header @version.
#   3. Commits with message "Sync branch config" and pushes main to origin.
#   4. Deletes the branch locally (-d or -D) and on origin (--delete). Remote
#      delete is best-effort (|| true).
#   5. Prints a message that the branch-specific userscript can be removed and
#      that changes are live on the main userscript.
#
# Use this when a feature branch is ready for release: it brings the branch into
# main and cleans up the branch so only the main userscript remains.
#
# Prerequisites: run from anywhere inside the repo; working tree clean; branch
# must exist locally and on origin.
#

set -e  # Exit on error

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

if ! git -C "$root" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Local branch '$BRANCH' does not exist."
  exit 1
fi

if ! git -C "$root" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "Remote branch 'origin/$BRANCH' does not exist."
  exit 1
fi

if [[ "$dry_run" != true ]]; then
  git -C "$root" checkout main
  git -C "$root" merge "$BRANCH"
fi

# Inlined sync-branch-config.sh logic
file_path="$root/fleet.user.js"
if [[ ! -f "$file_path" ]]; then
  echo "[error] fleet.user.js not found: $file_path"
  exit 1
fi
if [[ "$dry_run" == true ]]; then
  branch="main"
  echo "[info] Dry run - would merge $BRANCH into main, then sync fleet.user.js for main (no changes made)"
else
  branch="$(git -C "$root" rev-parse --abbrev-ref HEAD)"
  echo "[info] Current branch: $branch"
fi
header_version="$(
  awk '/^\/\/ @version[[:space:]]+/ {print $3; exit}' "$file_path"
)"
if [[ -z "$header_version" ]]; then
  echo "[error] Could not find @version in header"
  exit 1
fi
needs_name_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ \@name\s+(\[[^\]]+\]\s+)?(.+?)(?:\r?\n|\z)/m) {
      my ($tag, $name) = ($1, $2);
      $name =~ s/^\s+|\s+$//g;
      if ($ENV{BRANCH} eq "main") {
        print($tag ? "1" : "0");
      } else {
        my $expected = "[" . $ENV{BRANCH} . "] ";
        print((!defined $tag || $tag ne $expected) ? "1" : "0");
      }
    }
  ' "$file_path"
}
needs_download_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_update_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_github_config_change() {
  BRANCH="$branch" perl -0ne '
    if (/branch:\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_version_constant_change() {
  HEADER_VERSION="$header_version" perl -0ne '
    if (/const VERSION\s*=\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{HEADER_VERSION} ? "1" : "0");
    }
  ' "$file_path"
}
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
if [[ "$new_content" != "$content" ]]; then
  if [[ "$dry_run" == false ]]; then
    printf "%s" "$new_content" > "$file_path"
  fi
fi

# Enumerate every change (for dry run or summary)
print_fleet_changes() {
  local c="$1" n="$2"
  if [[ "$name_change" == "1" ]]; then
    local cur new
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
if [[ "$name_change" == "1" ]]; then changed+=("@name"); fi
if [[ "$download_change" == "1" ]]; then changed+=("@downloadURL"); fi
if [[ "$update_change" == "1" ]]; then changed+=("@updateURL"); fi
if [[ "$github_change" == "1" ]]; then changed+=("GITHUB_CONFIG.branch"); fi
if [[ "$version_change" == "1" ]]; then changed+=("VERSION constant"); fi
if [[ "${#changed[@]}" -gt 0 ]]; then
  if [[ "$dry_run" == true ]]; then
    echo "[dry-run] Would update fleet.user.js:"
    print_fleet_changes "$content" "$new_content"
  else
    echo "[info] Updated: ${changed[*]}"
  fi
else
  if [[ "$dry_run" == true ]]; then
    echo "[dry-run] fleet.user.js: no changes (all values already in sync for main)"
  else
    echo "[info] All values already in sync - no changes needed"
  fi
fi

if [[ "$dry_run" == true ]]; then
  echo "[dry-run] Would run: git checkout main"
  echo "[dry-run] Would run: git merge $BRANCH"
  [[ "${#changed[@]}" -gt 0 ]] && echo "[dry-run] Would run: (write fleet.user.js with above changes)"
  echo "[dry-run] Would run: git add ."
  echo "[dry-run] Would run: git commit -m \"Sync branch config\""
  echo "[dry-run] Would run: git push"
  echo "[dry-run] Would run: git branch -d $BRANCH (or -D)"
  echo "[dry-run] Would run: git push origin --delete $BRANCH"
  exit 0
fi

git -C "$root" add .
git -C "$root" commit -m "Sync branch config"
git -C "$root" push

git -C "$root" branch -d "$BRANCH" || git -C "$root" branch -D "$BRANCH"
git -C "$root" push origin --delete "$BRANCH" || true

echo "The $BRANCH specific userscript can now safely be deleted."
echo "All changes are now live on the main userscript."