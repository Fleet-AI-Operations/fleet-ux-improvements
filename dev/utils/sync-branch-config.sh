#!/usr/bin/env bash
#
# sync-branch-config.sh — Update fleet.user.js for the current git branch
#
# Usage:
#   ./sync-branch-config.sh        # use current git branch
#   ./sync-branch-config.sh -m     # update as if on main (ignore actual branch)
#   ./sync-branch-config.sh -c     # after sync, commit fleet.user.js if it changed
#
# Run from repo root (or anywhere; uses git to find root). Updates fleet.user.js:
#   - @name: add "[branch] " prefix when not main, remove when main
#   - @downloadURL / @updateURL: set segment to current branch
#   - GITHUB_CONFIG.branch: set to current branch
#   - const VERSION: set from header @version
#
# Used by test.sh (after creating a branch) and by release.sh (inlined for main after merge).
#

set -euo pipefail

use_main=false
commit_after=false
while getopts "mc" opt; do
  case "$opt" in
    m) use_main=true ;;
    c) commit_after=true ;;
    *) echo "Usage: $0 [-m] [-c]" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
file_path="$root/fleet.user.js"

if [[ "$use_main" == true ]]; then
  branch="main"
else
  branch="$(git -C "$root" rev-parse --abbrev-ref HEAD)"
fi

if [[ ! -f "$file_path" ]]; then
  echo "[error] fleet.user.js not found: $file_path" >&2
  exit 1
fi

header_version="$(
  awk '/^\/\/ @version[[:space:]]+/ {print $3; exit}' "$file_path"
)"
if [[ -z "$header_version" ]]; then
  echo "[error] Could not find @version in header" >&2
  exit 1
fi

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

changed=false
if [[ "$new_content" != "$content" ]]; then
  printf "%s" "$new_content" > "$file_path"
  changed=true
  echo "[info] Synced fleet.user.js for branch: $branch"
else
  echo "[info] fleet.user.js already in sync for branch: $branch"
fi

if [[ "$commit_after" == true ]]; then
  if [[ "$changed" == true ]]; then
    git -C "$root" add -- "$file_path"
    git -C "$root" commit -m "Sync fleet.user.js branch config to $branch"
    echo "[info] Committed fleet.user.js for branch: $branch"
  else
    echo "[info] No commit (-c): fleet.user.js was already in sync"
  fi
fi
