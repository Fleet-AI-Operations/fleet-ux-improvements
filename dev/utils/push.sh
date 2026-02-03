#!/bin/bash
#
# push.sh — Version-aware commit and push
#
# Usage:
#   ./utils/push.sh [--dry-run] ["optional commit message"]
#
# Options:
#   --dry-run  Print what would be done (version bumps, update-versions.sh, git steps); do not modify files or push.
#
# If no message is provided, uses: "push.sh auto commit at <DATE/TIME>".
#
# Effects:
#   1. Lists all files with uncommitted changes vs HEAD.
#   2. For each versioned file (plugins, fleet.user.js, docs/settings-modal/*.md)
#      that has changes: if the working-tree version is not higher than HEAD,
#      bumps that file's version by 0.1 in place. For settings-modal .md files,
#      also updates archetypes.json settingsModalDocs.
#   3. Always runs ./utils/update-versions.sh to sync archetypes.json and fleet.
#   4. git add -A, git commit -m "<message>", git push (only if there is
#      something to commit).
#
# Prerequisites: jq (required by update-versions.sh). Run from anywhere inside the repo.
#

set -e

# --- Paths (repo root via git so scripts in utils/ or dev/utils/ both work) ---
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
plugins_dir="$root/plugins"
archetypes_path="$root/archetypes.json"
fleet_path="$root/fleet.user.js"
settings_modal_dir="$root/docs/settings-modal"

# --- Options and commit message ---
dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
  shift
fi
commit_msg="${1:-push.sh auto commit at $(date '+%Y-%m-%d %H:%M:%S')}"

# --- Prerequisite: jq ---
if ! command -v jq &>/dev/null; then
  echo "[error] jq is required but not installed. Install with: brew install jq" >&2
  exit 1
fi

# --- Version extraction (from file path; content via stdin for HEAD) ---

# Extract _version from plugin JS content (stdin or file).
# Output: version string or nothing.
get_plugin_version() {
  local path="$1"
  if [[ "$path" == "-" ]]; then
    sed -n 's/.*_version[[:space:]]*:[[:space:]]*["'\'']\([^"'\'']*\)["'\''].*/\1/p' | head -1
  else
    [[ ! -f "$path" ]] && return 1
    sed -n 's/.*_version[[:space:]]*:[[:space:]]*["'\'']\([^"'\'']*\)["'\''].*/\1/p' "$path" | head -1
  fi
}

# Extract @version from fleet.user.js content (stdin or file).
get_fleet_header_version() {
  local path="$1"
  if [[ "$path" == "-" ]]; then
    awk '/^\/\/ @version[[:space:]]+/ { print $3; exit }'
  else
    [[ ! -f "$path" ]] && return 1
    awk '/^\/\/ @version[[:space:]]+/ { print $3; exit }' "$path"
  fi
}

# Extract const VERSION from fleet.user.js content (stdin or file).
get_fleet_const_version() {
  local path="$1"
  if [[ "$path" == "-" ]]; then
    sed -n "s/.*const VERSION = ['\''\"]\\([^'\''\"]*\\)['\''\"].*/\1/p" | head -1
  else
    [[ ! -f "$path" ]] && return 1
    sed -n "s/.*const VERSION = ['\''\"]\\([^'\''\"]*\\)['\''\"].*/\1/p" "$path" | head -1
  fi
}

# For fleet: use max of header and const (canonical).
get_fleet_version() {
  local path="$1"
  local h c
  if [[ "$path" == "-" ]]; then
    local content
    content="$(cat)"
    h="$(echo "$content" | get_fleet_header_version "-")"
    c="$(echo "$content" | get_fleet_const_version "-")"
  else
    h="$(get_fleet_header_version "$path")"
    c="$(get_fleet_const_version "$path")"
  fi
  max_version "${h:-}" "${c:-}"
}

# First line only (for settings-modal .md).
get_md_version() {
  local path="$1"
  if [[ "$path" == "-" ]]; then
    head -1
  else
    [[ ! -f "$path" ]] && return 1
    head -1 "$path"
  fi
}

# Return the higher of two version strings (x.y or x.y.z); empty treated as absent.
max_version() {
  local a="$1" b="$2"
  if [[ -z "$a" ]]; then echo "$b"; return; fi
  if [[ -z "$b" ]]; then echo "$a"; return; fi
  awk -v a="$a" -v b="$b" 'BEGIN {
    n = split(a, aa, "."); m = split(b, bb, ".");
    for (i = 1; i <= n || i <= m; i++) {
      va = (i <= n && aa[i] ~ /^[0-9]+$/) ? aa[i]+0 : 0;
      vb = (i <= m && bb[i] ~ /^[0-9]+$/) ? bb[i]+0 : 0;
      if (va > vb) { print a; exit; }
      if (vb > va) { print b; exit; }
    }
    print a;
  }'
}

# Return 0 if version a is strictly greater than b; else 1.
version_gt() {
  local a="$1" b="$2"
  local higher
  higher="$(max_version "$a" "$b")"
  [[ -n "$higher" ]] && [[ "$higher" == "$a" ]] && [[ "$a" != "$b" ]]
}

# Bump minor (second segment): 1.5 -> 1.6, 1.9 -> 1.10.
bump_minor() {
  local v="$1"
  awk -v v="$v" 'BEGIN {
    n = split(v, a, ".");
    if (n >= 2 && a[2] ~ /^[0-9]+$/) {
      a[2] = a[2] + 1;
      s = a[1];
      for (i = 2; i <= n; i++) s = s "." a[i];
      print s;
    } else {
      print v;
    }
  }'
}

# Bump plugin file _version in place (single or double quoted).
bump_plugin_file() {
  local path="$1" new_ver="$2" tmp
  tmp="$(mktemp)"
  # Match _version: 'X.Y' or _version: "X.Y"
  sed -E "s/(_version:[[:space:]]*['\"])[^'\"]*(['\"])/\\1${new_ver}\\2/" "$path" > "$tmp" && mv "$tmp" "$path"
}

# Bump fleet.user.js: @version line and const VERSION.
bump_fleet_file() {
  local path="$1" new_ver="$2" tmp
  tmp="$(mktemp)"
  # @version (third field) and const VERSION = '...' or "..."
  sed -E "s|^(// @version[[:space:]]+)[^[:space:]]+|\\1${new_ver}|; s/(const VERSION = ['\"])[^'\"]*(['\"])/\\1${new_ver}\\2/" "$path" > "$tmp" && mv "$tmp" "$path"
}

# Bump .md first line and archetypes.json settingsModalDocs for that doc.
bump_md_file() {
  local path="$1" new_ver="$2"
  local name
  name="$(basename "$path")"
  # Replace first line
  echo "$new_ver" > "$path.tmp" && tail -n +2 "$path" >> "$path.tmp" && mv "$path.tmp" "$path"
  # Update archetypes.json settingsModalDocs
  local tmp_json
  tmp_json="$(mktemp)"
  jq --arg name "$name" --arg ver "$new_ver" \
    '(.settingsModalDocs // []) |= (map(if .name == $name then .version = $ver else . end))' \
    "$archetypes_path" > "$tmp_json" && mv "$tmp_json" "$archetypes_path"
}

# --- Collect versioned file paths (relative to root) ---
collect_versioned_files() {
  local f
  # fleet
  [[ -f "$fleet_path" ]] && echo "fleet.user.js"
  # core plugins
  [[ -d "$plugins_dir/core/main" ]] && for f in "$plugins_dir/core/main"/*.js; do [[ -f "$f" ]] && echo "plugins/core/main/$(basename "$f")"; done
  [[ -d "$plugins_dir/core/dev" ]] && for f in "$plugins_dir/core/dev"/*.js; do [[ -f "$f" ]] && echo "plugins/core/dev/$(basename "$f")"; done
  # archetype plugins
  [[ -d "$plugins_dir/archetypes" ]] && for arch_path in "$plugins_dir/archetypes"/*; do
    [[ -d "$arch_path" ]] || continue
    arch_id="$(basename "$arch_path")"
    for subdir in main dev; do
      sub_path="$arch_path/$subdir"
      [[ -d "$sub_path" ]] || continue
      for f in "$sub_path"/*.js; do
        [[ -f "$f" ]] && echo "plugins/archetypes/${arch_id}/${subdir}/$(basename "$f")"
      done
    done
  done
  # settings-modal docs
  [[ -d "$settings_modal_dir" ]] && for f in "$settings_modal_dir"/*.md; do [[ -f "$f" ]] && echo "docs/settings-modal/$(basename "$f")"; done
}

# --- Main ---
# Changed files vs HEAD (staged + unstaged)
changed_files=""
if git -C "$root" rev-parse --verify HEAD &>/dev/null; then
  changed_files="$(git -C "$root" diff HEAD --name-only 2>/dev/null || true)"
fi

# If nothing changed at all, we still run update-versions.sh and then try commit
versioned_list="$(collect_versioned_files)"

while IFS= read -r rel_path; do
  [[ -z "$rel_path" ]] && continue
  if ! echo "$changed_files" | grep -qFx "$rel_path"; then
    continue
  fi

  # Get HEAD version (skip if file is new)
  head_version=""
  if git -C "$root" rev-parse --verify HEAD &>/dev/null && git -C "$root" show "HEAD:$rel_path" &>/dev/null; then
    head_content="$(git -C "$root" show "HEAD:$rel_path" 2>/dev/null)" || true
    if [[ -n "$head_content" ]]; then
      if [[ "$rel_path" == "fleet.user.js" ]]; then
        head_version="$(echo "$head_content" | get_fleet_version "-")"
      elif [[ "$rel_path" == *.md ]]; then
        head_version="$(echo "$head_content" | get_md_version "-")"
      else
        head_version="$(echo "$head_content" | get_plugin_version "-")"
      fi
    fi
  fi

  # New file (not in HEAD): skip bump
  if [[ -z "$head_version" ]]; then
    continue
  fi

  abs_path="$root/$rel_path"
  # Get working version
  working_version=""
  if [[ "$rel_path" == "fleet.user.js" ]]; then
    working_version="$(get_fleet_version "$abs_path")"
  elif [[ "$rel_path" == *.md ]]; then
    working_version="$(get_md_version "$abs_path")"
  else
    working_version="$(get_plugin_version "$abs_path")"
  fi

  # If working version is higher than HEAD, no bump
  if version_gt "$working_version" "$head_version"; then
    continue
  fi

  # Bump by 0.1
  new_version="$(bump_minor "$working_version")"
  if [[ -z "$new_version" ]]; then
    new_version="$(bump_minor "$head_version")"
  fi
  [[ -z "$new_version" ]] && continue

  if [[ "$dry_run" == true ]]; then
    if [[ "$rel_path" == "fleet.user.js" ]]; then
      echo "[dry-run] Would bump fleet.user.js: -> $new_version" >&2
    elif [[ "$rel_path" == *.md ]]; then
      echo "[dry-run] Would bump $rel_path -> $new_version (and archetypes.json settingsModalDocs)" >&2
    else
      echo "[dry-run] Would bump $rel_path -> $new_version" >&2
    fi
  else
    if [[ "$rel_path" == "fleet.user.js" ]]; then
      bump_fleet_file "$abs_path" "$new_version"
      echo "[info] Bumped fleet.user.js to $new_version" >&2
    elif [[ "$rel_path" == *.md ]]; then
      bump_md_file "$abs_path" "$new_version"
      echo "[info] Bumped $rel_path to $new_version (and archetypes.json settingsModalDocs)" >&2
    else
      bump_plugin_file "$abs_path" "$new_version"
      echo "[info] Bumped $rel_path to $new_version" >&2
    fi
  fi
done <<< "$versioned_list"

# Always run update-versions.sh (with --dry-run if we are dry-running)
if [[ "$dry_run" == true ]]; then
  echo "[dry-run] Would run: $script_dir/update-versions.sh --dry-run" >&2
  "$script_dir/update-versions.sh" --dry-run
  echo "[dry-run] Would run: git add -A && git commit -m \"$commit_msg\" && git push" >&2
  exit 0
fi

"$script_dir/update-versions.sh"

# Commit and push only if there is something to commit
if [[ -z "$(git -C "$root" status --short)" ]]; then
  echo "[info] Nothing to commit." >&2
  exit 0
fi

git -C "$root" add -A
git -C "$root" commit -m "$commit_msg"
git -C "$root" push
