#!/usr/bin/env bash
#
# sync-branch-config.sh — Update branch-bound userscript config for current git branch
#
# Usage:
#   ./sync-branch-config.sh              # use current git branch, default fleet path
#   ./sync-branch-config.sh -m           # update as if on main (ignore actual branch)
#   ./sync-branch-config.sh -c           # after sync, commit changed userscript files
#   ./sync-branch-config.sh --dry-run    # print planned changes; do not write or commit
#   ./sync-branch-config.sh --fleet PATH # read/write this file instead of <root>/fleet.user.js
#   ./sync-branch-config.sh --branch NAME # use NAME instead of git HEAD (ignored if -m)
#
# Run from repo root (or anywhere; uses git to find root). Updates:
#   - fleet.user.js
#   - @name: add "[branch] " prefix when not main, remove when main
#   - @downloadURL / @updateURL: set segment to current branch
#   - GITHUB_CONFIG.branch: set to current branch
#   - const VERSION: set from header @version
#   - dev/fleet-dev-id.user.js
#   - @downloadURL / @updateURL: set segment to current branch
#   - const BRANCH_NAME: set to current branch
#
# Used by checkout.sh and test.sh; may be run directly.
#

set -euo pipefail

use_main=false
commit_after=false
dry_run=false
fleet_path_arg=""
branch_override=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m) use_main=true; shift ;;
    -c) commit_after=true; shift ;;
    -mc|-cm) use_main=true; commit_after=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --fleet)
      if [[ $# -lt 2 ]]; then
        echo "[error] --fleet requires a path" >&2
        exit 1
      fi
      fleet_path_arg="$2"
      shift 2
      ;;
    --branch)
      if [[ $# -lt 2 ]]; then
        echo "[error] --branch requires a name" >&2
        exit 1
      fi
      branch_override="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [-m] [-c] [--dry-run] [--fleet PATH] [--branch NAME]" >&2
      exit 1
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
file_path="${fleet_path_arg:-$root/fleet.user.js}"
dev_id_path="$root/dev/fleet-dev-id.user.js"

if [[ "$use_main" == true ]]; then
  branch="main"
elif [[ -n "$branch_override" ]]; then
  branch="$branch_override"
else
  branch="$(git -C "$root" rev-parse --abbrev-ref HEAD)"
fi

if [[ "$dry_run" == true ]]; then
  commit_after=false
fi

if [[ ! -f "$file_path" ]]; then
  echo "[error] fleet.user.js not found: $file_path" >&2
  exit 1
fi

if [[ ! -f "$dev_id_path" ]]; then
  echo "[error] dev ID userscript not found: $dev_id_path" >&2
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

dev_id_content="$(cat "$dev_id_path")"
dev_id_new_content="$(printf "%s" "$dev_id_content" | BRANCH="$branch" perl -0pe '
  s{(// @(?:download|update)URL\s+https://raw\.githubusercontent\.com/[^/]+/[^/]+/)([^/]+)(/dev/fleet-dev-id\.user\.js)}{$1.$ENV{BRANCH}.$3}ge;
  s{(const BRANCH_NAME\s*=\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1.$ENV{BRANCH}.$3}ge;
')"

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

needs_dev_id_download_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/dev\/fleet-dev-id\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$dev_id_path"
}

needs_dev_id_update_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/dev\/fleet-dev-id\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$dev_id_path"
}

needs_dev_id_branch_change() {
  BRANCH="$branch" perl -0ne '
    if (/const BRANCH_NAME\s*=\s*["\x27]([^"\x27]+)["\x27]/) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$dev_id_path"
}

print_fleet_changes() {
  local c="$1" n="$2"
  local cur new
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

print_dev_id_changes() {
  local c="$1" n="$2"
  local cur new
  if [[ "$dev_id_download_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  dev/fleet-dev-id.user.js: @downloadURL: \"$cur\" -> \"$new\""
  fi
  if [[ "$dev_id_update_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  dev/fleet-dev-id.user.js: @updateURL: \"$cur\" -> \"$new\""
  fi
  if [[ "$dev_id_branch_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /const BRANCH_NAME\s*=\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /const BRANCH_NAME\s*=\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  dev/fleet-dev-id.user.js: BRANCH_NAME: \"$cur\" -> \"$new\""
  fi
}

if [[ "$dry_run" == true ]]; then
  name_change="$(needs_name_change)"
  download_change="$(needs_download_url_change)"
  update_change="$(needs_update_url_change)"
  github_change="$(needs_github_config_change)"
  version_change="$(needs_version_constant_change)"
  dev_id_download_change="$(needs_dev_id_download_url_change)"
  dev_id_update_change="$(needs_dev_id_update_url_change)"
  dev_id_branch_change="$(needs_dev_id_branch_change)"
  changed=()
  [[ "$name_change" == "1" ]] && changed+=("@name")
  [[ "$download_change" == "1" ]] && changed+=("@downloadURL")
  [[ "$update_change" == "1" ]] && changed+=("@updateURL")
  [[ "$github_change" == "1" ]] && changed+=("GITHUB_CONFIG.branch")
  [[ "$version_change" == "1" ]] && changed+=("VERSION constant")
  [[ "$dev_id_download_change" == "1" ]] && changed+=("dev/fleet-dev-id.user.js @downloadURL")
  [[ "$dev_id_update_change" == "1" ]] && changed+=("dev/fleet-dev-id.user.js @updateURL")
  [[ "$dev_id_branch_change" == "1" ]] && changed+=("dev/fleet-dev-id.user.js BRANCH_NAME")
  if [[ "${#changed[@]}" -gt 0 ]]; then
    echo "[dry-run] Would update branch config files:"
    print_fleet_changes "$content" "$new_content"
    print_dev_id_changes "$dev_id_content" "$dev_id_new_content"
  else
    echo "[dry-run] branch config files: no changes (all values already in sync for branch $branch)"
  fi
  exit 0
fi

changed_write=false
if [[ "$new_content" != "$content" ]]; then
  printf "%s" "$new_content" > "$file_path"
  changed_write=true
  echo "[info] Synced fleet.user.js for branch: $branch"
else
  echo "[info] fleet.user.js already in sync for branch: $branch"
fi

if [[ "$dev_id_new_content" != "$dev_id_content" ]]; then
  printf "%s" "$dev_id_new_content" > "$dev_id_path"
  changed_write=true
  echo "[info] Synced dev/fleet-dev-id.user.js for branch: $branch"
else
  echo "[info] dev/fleet-dev-id.user.js already in sync for branch: $branch"
fi

if [[ "$commit_after" == true ]]; then
  if [[ "$changed_write" == true ]]; then
    git -C "$root" add -- "$file_path" "$dev_id_path"
    git -C "$root" commit -m "Sync branch config to $branch"
    echo "[info] Committed branch config files for branch: $branch"
  else
    echo "[info] No commit (-c): branch config files were already in sync"
  fi
fi
