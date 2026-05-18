#!/usr/bin/env bash
#
# sync-branch-config.sh — Update branch-bound userscript config for current git branch
#
# Usage:
#   ./sync-branch-config.sh              # use current git branch, default fleet path
#   ./sync-branch-config.sh -m           # update as if on main (ignore actual branch)
#   ./sync-branch-config.sh -c           # after sync, commit changed userscript files
#   ./sync-branch-config.sh --dry-run    # print planned changes; do not write or commit
#   ./sync-branch-config.sh --print-commit-message  # print the canonical one-line git commit message and exit
#   ./sync-branch-config.sh --fleet PATH # read/write this file instead of <root>/fleet.user.js
#   ./sync-branch-config.sh --branch NAME # use NAME instead of git HEAD (ignored if -m)
#
# Run from repo root (or anywhere; uses git to find root). Owner, repo, and @name base
# always come from git (origin remote + origin/main:fleet.user.js), never from existing
# script contents. Updates:
#   - fleet.user.js
#   - @name: base from origin/main; "[branch] " prefix when not main
#   - @downloadURL / @updateURL: full raw URL from origin owner/repo + target branch
#   - GITHUB_CONFIG.owner / .repo / .branch: from origin remote + target branch
#   - const VERSION: set from header @version in the file being synced
#   - dev/fleet-dev-id.user.js
#   - @name: base from origin/main dev script; "[branch] " prefix when not main
#   - @downloadURL / @updateURL: full raw URL from origin owner/repo + target branch
#   - const BRANCH_NAME: set to target branch
#
# Used by checkout.sh and test.sh; may be run directly.
#

set -euo pipefail

use_main=false
commit_after=false
dry_run=false
print_commit_message=false
fleet_path_arg=""
branch_override=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m) use_main=true; shift ;;
    -c) commit_after=true; shift ;;
    -mc|-cm) use_main=true; commit_after=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --print-commit-message) print_commit_message=true; shift ;;
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
      echo "Usage: $0 [-m] [-c] [--dry-run] [--print-commit-message] [--fleet PATH] [--branch NAME]" >&2
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

if [[ "$print_commit_message" == true ]]; then
  printf '%s\n' "Sync branch config to $branch"
  exit 0
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

if ! origin_url="$(git -C "$root" remote get-url origin 2>/dev/null)"; then
  echo "[error] No git remote named 'origin'" >&2
  exit 1
fi
if ! origin_owner="$(printf '%s' "$origin_url" | perl -ne 'if (m{github\.com[:/]([^/]+)/([^/.]+)(?:\.git)?\s*$}i) { print $1; exit }')"; then
  echo "[error] Could not parse GitHub owner from origin URL: $origin_url" >&2
  exit 1
fi
if ! origin_repo="$(printf '%s' "$origin_url" | perl -ne 'if (m{github\.com[:/]([^/]+)/([^/.]+)(?:\.git)?\s*$}i) { print $2; exit }')"; then
  echo "[error] Could not parse GitHub repo from origin URL: $origin_url" >&2
  exit 1
fi

if ! git -C "$root" rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "[error] origin/main is required (run: git fetch origin main)" >&2
  exit 1
fi

fleet_base_name="$(git -C "$root" show origin/main:fleet.user.js | perl -ne '
  if (/^\/\/ \@name\s+(?:\[[^\]]+\]\s+)?(.+?)\s*$/) { print $1; exit }
' || true)"
if [[ -z "$fleet_base_name" ]]; then
  echo "[error] Could not read @name base from origin/main:fleet.user.js" >&2
  exit 1
fi

if [[ "$branch" == "main" ]]; then
  fleet_display_name="$fleet_base_name"
else
  fleet_display_name="[${branch}] ${fleet_base_name}"
fi

if git -C "$root" cat-file -e "origin/main:dev/fleet-dev-id.user.js" 2>/dev/null; then
  dev_id_base_name="$(git -C "$root" show origin/main:dev/fleet-dev-id.user.js | perl -ne '
    if (/^\/\/ \@name\s+(?:\[[^\]]+\]\s+)?(.+?)\s*$/) { print $1; exit }
  ' || true)"
elif git -C "$root" cat-file -e "origin/main:dev/fleet-godmode.user.js" 2>/dev/null; then
  # Main still has legacy godmode file; use canonical DEV-ID title until main is updated.
  dev_id_base_name="DEV-ID - Fleet UX Enhancer - (dev identifier)"
else
  echo "[error] Could not read dev ID @name base from origin/main (dev/fleet-dev-id.user.js or dev/fleet-godmode.user.js)" >&2
  exit 1
fi
if [[ -z "$dev_id_base_name" ]]; then
  echo "[error] Could not read @name base from origin/main:dev/fleet-dev-id.user.js" >&2
  exit 1
fi

if [[ "$branch" == "main" ]]; then
  dev_id_display_name="$dev_id_base_name"
else
  dev_id_display_name="[${branch}] ${dev_id_base_name}"
fi

fleet_raw_url="https://raw.githubusercontent.com/${origin_owner}/${origin_repo}/${branch}/fleet.user.js"
dev_id_raw_url="https://raw.githubusercontent.com/${origin_owner}/${origin_repo}/${branch}/dev/fleet-dev-id.user.js"

header_version="$(
  awk '/^\/\/ @version[[:space:]]+/ {print $3; exit}' "$file_path"
)"
if [[ -z "$header_version" ]]; then
  echo "[error] Could not find @version in header" >&2
  exit 1
fi

content="$(cat "$file_path")"
new_content="$(printf "%s" "$content" | \
  BRANCH="$branch" \
  ORIGIN_OWNER="$origin_owner" \
  ORIGIN_REPO="$origin_repo" \
  FLEET_DISPLAY_NAME="$fleet_display_name" \
  FLEET_RAW_URL="$fleet_raw_url" \
  HEADER_VERSION="$header_version" \
  perl -0pe '
  s{^(// \@name\s+).*$}{$1$ENV{FLEET_DISPLAY_NAME}}mg;
  s{^(// \@downloadURL\s+).*$}{$1$ENV{FLEET_RAW_URL}}mg;
  s{^(// \@updateURL\s+).*$}{$1$ENV{FLEET_RAW_URL}}mg;
  s{(owner:\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1$ENV{ORIGIN_OWNER}$3}g;
  s{(repo:\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1$ENV{ORIGIN_REPO}$3}g;
  s{(branch:\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1$ENV{BRANCH}$3}g;
  s{(const VERSION\s*=\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1$ENV{HEADER_VERSION}$3}g;
')"

dev_id_content="$(cat "$dev_id_path")"
dev_id_new_content="$(printf "%s" "$dev_id_content" | \
  BRANCH="$branch" \
  DEV_ID_DISPLAY_NAME="$dev_id_display_name" \
  DEV_ID_RAW_URL="$dev_id_raw_url" \
  perl -0pe '
  s{^(// \@name\s+).*$}{$1$ENV{DEV_ID_DISPLAY_NAME}}mg;
  s{^(// \@downloadURL\s+).*$}{$1$ENV{DEV_ID_RAW_URL}}mg;
  s{^(// \@updateURL\s+).*$}{$1$ENV{DEV_ID_RAW_URL}}mg;
  s{(const BRANCH_NAME\s*=\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1$ENV{BRANCH}$3}g;
')"

needs_name_change() {
  FLEET_DISPLAY_NAME="$fleet_display_name" perl -0ne '
    if (/^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{FLEET_DISPLAY_NAME} ? "1" : "0");
    }
  ' "$file_path"
}
needs_download_url_change() {
  FLEET_RAW_URL="$fleet_raw_url" perl -0ne '
    if (/^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{FLEET_RAW_URL} ? "1" : "0");
    }
  ' "$file_path"
}
needs_update_url_change() {
  FLEET_RAW_URL="$fleet_raw_url" perl -0ne '
    if (/^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{FLEET_RAW_URL} ? "1" : "0");
    }
  ' "$file_path"
}
needs_github_owner_change() {
  ORIGIN_OWNER="$origin_owner" perl -0ne '
    if (/owner:\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{ORIGIN_OWNER} ? "1" : "0");
    }
  ' "$file_path"
}
needs_github_repo_change() {
  ORIGIN_REPO="$origin_repo" perl -0ne '
    if (/repo:\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{ORIGIN_REPO} ? "1" : "0");
    }
  ' "$file_path"
}
needs_github_branch_change() {
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

needs_dev_id_name_change() {
  DEV_ID_DISPLAY_NAME="$dev_id_display_name" perl -0ne '
    if (/^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{DEV_ID_DISPLAY_NAME} ? "1" : "0");
    }
  ' "$dev_id_path"
}

needs_dev_id_download_url_change() {
  DEV_ID_RAW_URL="$dev_id_raw_url" perl -0ne '
    if (/^\/\/ \@downloadURL\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{DEV_ID_RAW_URL} ? "1" : "0");
    }
  ' "$dev_id_path"
}

needs_dev_id_update_url_change() {
  DEV_ID_RAW_URL="$dev_id_raw_url" perl -0ne '
    if (/^\/\/ \@updateURL\s+(.+?)(?:\r?\n|\z)/m) {
      my $cur = $1;
      $cur =~ s/^\s+|\s+$//g;
      print($cur ne $ENV{DEV_ID_RAW_URL} ? "1" : "0");
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
  if [[ "$github_owner_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /owner:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /owner:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  fleet.user.js: GITHUB_CONFIG.owner: \"$cur\" -> \"$new\""
  fi
  if [[ "$github_repo_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /repo:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /repo:\s*["\x27]([^"\x27]+)["\x27]/' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  fleet.user.js: GITHUB_CONFIG.repo: \"$cur\" -> \"$new\""
  fi
  if [[ "$github_branch_change" == "1" ]]; then
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
  if [[ "$dev_id_name_change" == "1" ]]; then
    cur="$(printf '%s' "$c" | perl -0ne 'print $1 if /^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    new="$(printf '%s' "$n" | perl -0ne 'print $1 if /^\/\/ \@name\s+(.+?)(?:\r?\n|\z)/m' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "  dev/fleet-dev-id.user.js: @name: \"$cur\" -> \"$new\""
  fi
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
  github_owner_change="$(needs_github_owner_change)"
  github_repo_change="$(needs_github_repo_change)"
  github_branch_change="$(needs_github_branch_change)"
  version_change="$(needs_version_constant_change)"
  dev_id_name_change="$(needs_dev_id_name_change)"
  dev_id_download_change="$(needs_dev_id_download_url_change)"
  dev_id_update_change="$(needs_dev_id_update_url_change)"
  dev_id_branch_change="$(needs_dev_id_branch_change)"
  changed=()
  [[ "$name_change" == "1" ]] && changed+=("@name")
  [[ "$download_change" == "1" ]] && changed+=("@downloadURL")
  [[ "$update_change" == "1" ]] && changed+=("@updateURL")
  [[ "$github_owner_change" == "1" ]] && changed+=("GITHUB_CONFIG.owner")
  [[ "$github_repo_change" == "1" ]] && changed+=("GITHUB_CONFIG.repo")
  [[ "$github_branch_change" == "1" ]] && changed+=("GITHUB_CONFIG.branch")
  [[ "$version_change" == "1" ]] && changed+=("VERSION constant")
  [[ "$dev_id_name_change" == "1" ]] && changed+=("dev/fleet-dev-id.user.js @name")
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
