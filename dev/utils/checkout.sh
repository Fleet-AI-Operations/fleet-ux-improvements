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

# Repo root from script location so git and file paths work regardless of CWD
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"

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

if [[ "$dry_run" != true ]]; then
  git -C "$root" checkout main
  git -C "$root" checkout -b "$BRANCH"
fi

# Inlined sync-branch-config.sh logic
file_path="$root/fleet.user.js"
if [[ ! -f "$file_path" ]]; then
  echo "[error] fleet.user.js not found: $file_path"
  exit 1
fi
if [[ "$dry_run" == true ]]; then
  branch="$BRANCH"
  echo "[info] Dry run - would create branch: $BRANCH (no git or file changes)"
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
    echo "[dry-run] fleet.user.js: no changes (all values already in sync for branch $branch)"
  else
    echo "[info] All values already in sync - no changes needed"
  fi
fi

if [[ "$dry_run" == true ]]; then
  echo "[dry-run] Would run: git checkout main"
  echo "[dry-run] Would run: git checkout -b $BRANCH"
  [[ "${#changed[@]}" -gt 0 ]] && echo "[dry-run] Would run: (write fleet.user.js with above changes)"
  echo "[dry-run] Would run: git add ."
  echo "[dry-run] Would run: git commit -m \"Sync branch config\""
  echo "[dry-run] Would run: git push -u origin $BRANCH"
  exit 0
fi

git -C "$root" add .
git -C "$root" commit -m "Sync branch config"
git -C "$root" push -u origin "$BRANCH"

url="$(cd "$root" && gh browse --no-browser "$BRANCH")" 
ghuser=$(echo "$url" | perl -nE 'say $1 if m{github\.com/([^/]+)}') 
ghrepo=$(echo "$url" | perl -nE 'say $1 if m{'"$ghuser"'/([^/]+)/}') 
ghfile=$(echo "$url" | perl -nE 'say $1 if m{tree/[^/]+/(.+)}') 
GITHUB_URL="https://github.com/$ghuser/$ghrepo/tree/$BRANCH/$ghfile" 

echo "You MUST test and develop using this $BRANCH specific userscript."
echo "Install it at:"
echo "$GITHUB_URL"