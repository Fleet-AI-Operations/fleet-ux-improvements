#!/bin/bash
#
# update-versions.sh — Sync archetypes.json versions with plugin files and fleet.user.js
#
# Usage:
#   ./utils/update-versions.sh [--root DIR] [--plugins-dir DIR] [--archetypes PATH] [--fleet PATH]
#
# Options:
#   --root DIR         Repository root (default: parent of script directory).
#   --plugins-dir DIR  Plugins directory (default: <root>/plugins).
#   --archetypes PATH  Path to archetypes.json (default: <root>/archetypes.json).
#   --fleet PATH       Path to fleet.user.js (default: <root>/fleet.user.js).
#
# Effects:
#   1. Reads @version and const VERSION from fleet.user.js; if they differ, normalizes both to the higher value.
#   2. Collects _version from plugin .js files (core/main, core/dev, archetypes/*/main, archetypes/*/dev).
#   3. Updates archetypes.json: version (only when fleet canonical is higher than current), corePlugins,
#      devPlugins, each archetype's plugins, each devArchetype's plugins.
#   4. If any version was updated, bumps archetypesVersion by 0.1 (minor; e.g. 3.9 -> 3.10).
#
# Prerequisites: jq (must be on PATH).
#

set -e

# Extract _version from a plugin JS file (first match only).
# Output: version string or nothing.
get_plugin_version() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  sed -n 's/.*_version[[:space:]]*:[[:space:]]*["'\'']\([^"'\'']*\)["'\''].*/\1/p' "$path" | head -1
}

# Extract @version from fleet.user.js (header).
get_fleet_version() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  awk '/^\/\/ @version[[:space:]]+/ { print $3; exit }' "$path"
}

# Extract const VERSION from fleet.user.js.
get_const_version() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  sed -n "s/.*const VERSION = ['\''\"]\\([^'\''\"]*\\)['\''\"].*/\1/p" "$path" | head -1
}

# Return the higher of two version strings (x.y.z); empty treated as absent.
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

# Parse arguments.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"
plugins_dir=""
archetypes_path=""
fleet_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      root="$(cd "$2" && pwd)"
      shift 2
      ;;
    --plugins-dir)
      plugins_dir="$2"
      shift 2
      ;;
    --archetypes)
      archetypes_path="$2"
      shift 2
      ;;
    --fleet)
      fleet_path="$2"
      shift 2
      ;;
    *)
      echo "[error] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

plugins_dir="${plugins_dir:-$root/plugins}"
archetypes_path="${archetypes_path:-$root/archetypes.json}"
fleet_path="${fleet_path:-$root/fleet.user.js}"

core_dir="$plugins_dir/core/main"
dev_dir="$plugins_dir/core/dev"
archetypes_dir="$plugins_dir/archetypes"

# Prerequisite: jq
if ! command -v jq &>/dev/null; then
  echo "[error] jq is required but not installed. Install with: brew install jq" >&2
  exit 1
fi

# Validate paths
if [[ ! -d "$plugins_dir" ]]; then
  echo "[error] Plugins directory not found: $plugins_dir" >&2
  exit 1
fi
if [[ ! -d "$core_dir" ]]; then
  echo "[error] Core directory not found: $core_dir" >&2
  exit 1
fi
if [[ ! -d "$dev_dir" ]]; then
  echo "[error] Dev directory not found: $dev_dir" >&2
  exit 1
fi
if [[ ! -f "$archetypes_path" ]]; then
  echo "[error] archetypes.json not found: $archetypes_path" >&2
  exit 1
fi
if [[ ! -f "$fleet_path" ]]; then
  echo "[error] fleet.user.js not found: $fleet_path" >&2
  exit 1
fi

# Fleet version: read both locations, normalize to higher if they differ, use canonical
header_version="$(get_fleet_version "$fleet_path")"
const_version="$(get_const_version "$fleet_path")"
fleet_version="$(max_version "$header_version" "$const_version")"
tmp_fleet=""
if [[ -n "$fleet_version" ]] && [[ "$header_version" != "$const_version" ]]; then
  tmp_fleet="$(mktemp)"
  sed -e "/^\/\/ @version/s|^\(// @version[[:space:]]*\)[^[:space:]]*|\1$fleet_version|" \
      -e "s/\(const VERSION = ['\''\"]\)[^'\''\"]*\(['\''\"]\)/\1$fleet_version\2/" \
      "$fleet_path" > "$tmp_fleet" && mv "$tmp_fleet" "$fleet_path"
  tmp_fleet=""
  echo "[info] Normalized fleet.user.js: both version locations set to $fleet_version" >&2
fi

# Version for archetypes.json: never decrease (use max of canonical fleet and current archetypes version)
current_arch_version="$(jq -r '.version // ""' "$archetypes_path")"
version_for_archetypes="$(max_version "$fleet_version" "$current_arch_version")"

# Build core plugin versions JSON (key: filename)
core_json="{"
first_core=1
for f in "$core_dir"/*.js; do
  [[ -f "$f" ]] || continue
  name="$(basename "$f")"
  ver="$(get_plugin_version "$f")"
  if [[ -z "$ver" ]]; then
    echo "[warn] No _version found in $name" >&2
    continue
  fi
  [[ $first_core -eq 1 ]] || core_json+=","
  first_core=0
  core_json+="$(printf '%s' "$name" | jq -Rs .): $(printf '%s' "$ver" | jq -Rs .)"
done
core_json+="}"

# Build dev plugin versions JSON (key: filename)
dev_json="{"
first_dev=1
for f in "$dev_dir"/*.js; do
  [[ -f "$f" ]] || continue
  name="$(basename "$f")"
  ver="$(get_plugin_version "$f")"
  if [[ -z "$ver" ]]; then
    echo "[warn] No _version found in $name" >&2
    continue
  fi
  [[ $first_dev -eq 1 ]] || dev_json+=","
  first_dev=0
  dev_json+="$(printf '%s' "$name" | jq -Rs .): $(printf '%s' "$ver" | jq -Rs .)"
done
dev_json+="}"

# Build archetype plugin versions JSON (key: archetype-id/main/filename or archetype-id/dev/filename)
plugins_json="{"
first_plugin=1
if [[ -d "$archetypes_dir" ]]; then
  for arch_path in "$archetypes_dir"/*; do
    [[ -d "$arch_path" ]] || continue
    arch_id="$(basename "$arch_path")"
    for subdir in main dev; do
      sub_path="$arch_path/$subdir"
      [[ -d "$sub_path" ]] || continue
      for f in "$sub_path"/*.js; do
        [[ -f "$f" ]] || continue
        name="$(basename "$f")"
        ver="$(get_plugin_version "$f")"
        if [[ -z "$ver" ]]; then
          echo "[warn] No _version found in $arch_id/$subdir/$name" >&2
          continue
        fi
        key="$arch_id/$subdir/$name"
        [[ $first_plugin -eq 1 ]] || plugins_json+=","
        first_plugin=0
        plugins_json+="$(printf '%s' "$key" | jq -Rs .): $(printf '%s' "$ver" | jq -Rs .)"
      done
    done
  done
fi
plugins_json+="}"

versions_json=$(jq -n \
  --argjson core "$core_json" \
  --argjson dev "$dev_json" \
  --argjson plugins "$plugins_json" \
  --arg fleet "${version_for_archetypes:-}" \
  '{ core: $core, dev: $dev, plugins: $plugins, fleet: $fleet }')

# Check we have something to do (core_json/dev_json/plugins_json have at least one key if non-empty)
has_versions=false
[[ "$core_json" != "{}" ]] && has_versions=true
[[ "$dev_json" != "{}" ]] && has_versions=true
[[ "$plugins_json" != "{}" ]] && has_versions=true
[[ -n "$version_for_archetypes" ]] && has_versions=true
if [[ "$has_versions" != "true" ]]; then
  echo "[warn] No plugin versions found to update."
  exit 0
fi

# Update archetypes.json with jq
tmp_json="$(mktemp)"
trap 'rm -f "$tmp_json" $tmp_fleet' EXIT

jq -n --slurpfile arch "$archetypes_path" --argjson v "$versions_json" '
  def bump_minor: split(".") | (.[1] |= ((tonumber? // 0) + 1 | tostring)) | join(".");
  ($arch[0]) as $a
  | $a
  | .version = (if $v.fleet != "" then $v.fleet else .version end)
  | .corePlugins |= (map(.name as $n | .version = ($v.core[$n] // .version)))
  | .devPlugins |= (map(.name as $n | .version = ($v.dev[$n] // .version)))
  | (.archetypes // []) |= (map(.id as $aid | .plugins |= (map(.name as $n | .version = ($v.plugins[$aid + "/main/" + $n] // .version)))))
  | (.devArchetypes // []) |= (map(.id as $aid | .plugins |= (map(.name as $n | .version = ($v.plugins[$aid + "/dev/" + $n] // .version)))))
' > "$tmp_json"

if ! cmp -s "$archetypes_path" "$tmp_json"; then
  # Bump archetypesVersion when something changed
  jq '.archetypesVersion = (.archetypesVersion | split(".") | (.[1] |= ((tonumber? // 0) + 1 | tostring)) | join("."))' "$tmp_json" > "${tmp_json}.bumped"
  mv "${tmp_json}.bumped" "$tmp_json"
  cp "$tmp_json" "$archetypes_path"
  echo "[info] Updated plugin version(s) in $(basename "$archetypes_path")"
else
  echo "[info] No version changes in $(basename "$archetypes_path")"
fi

exit 0
