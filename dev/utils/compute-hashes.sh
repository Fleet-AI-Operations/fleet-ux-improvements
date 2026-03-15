#!/bin/bash
#
# compute-hashes.sh — Compute SHA-256 hashes for all plugins and update archetypes.json
#
# Usage:
#   ./dev/utils/compute-hashes.sh [--dry-run] [--root DIR] [--archetypes PATH] [--plugins-dir DIR]
#
# Options:
#   --dry-run          Print what would be changed; do not modify archetypes.json.
#   --root DIR         Repository root (default: derived from git).
#   --archetypes PATH  Path to archetypes.json (default: <root>/archetypes.json).
#   --plugins-dir DIR  Plugins directory (default: <root>/plugins).
#
# Effects:
#   1. Reads plugin entries from archetypes.json (corePlugins, devPlugins, archetypes, devArchetypes).
#   2. Computes SHA-256 hash of each plugin file on disk.
#   3. Adds or updates the "hash" field on each plugin object in archetypes.json.
#
# Prerequisites: jq, shasum (standard on macOS and most Linux).

set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
archetypes_path=""
plugins_dir=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)       dry_run=true; shift ;;
    --root)          root="$(cd "$2" && pwd)"; shift 2 ;;
    --archetypes)    archetypes_path="$2"; shift 2 ;;
    --plugins-dir)   plugins_dir="$2"; shift 2 ;;
    *)               echo "[error] Unknown option: $1" >&2; exit 1 ;;
  esac
done

archetypes_path="${archetypes_path:-$root/archetypes.json}"
plugins_dir="${plugins_dir:-$root/plugins}"

if ! command -v jq &>/dev/null; then
  echo "[error] jq is required but not installed." >&2
  exit 1
fi

if [[ ! -f "$archetypes_path" ]]; then
  echo "[error] archetypes.json not found: $archetypes_path" >&2
  exit 1
fi

if [[ ! -d "$plugins_dir" ]]; then
  echo "[error] Plugins directory not found: $plugins_dir" >&2
  exit 1
fi

# Returns "sha256-<hex>" for a file, or empty string if the file does not exist.
compute_hash() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    echo ""
    return
  fi
  local hex
  hex="$(shasum -a 256 "$filepath" | awk '{print $1}')"
  echo "sha256-${hex}"
}

# Build a JSON object mapping logical keys to hashes.
# Keys use prefixes to disambiguate sections (core/, dev/, arch/, devarch/).
hashes_json="{"
first=true

# corePlugins → plugins/core/main/<name>
while IFS= read -r name; do
  filepath="$plugins_dir/core/main/$name"
  hash="$(compute_hash "$filepath")"
  if [[ -z "$hash" ]]; then
    echo "[warn] Core plugin file not found: $filepath" >&2
  fi
  $first || hashes_json+=","
  first=false
  hashes_json+="$(printf '%s' "core/$name" | jq -Rs .): $(printf '%s' "$hash" | jq -Rs .)"
done < <(jq -r '.corePlugins[].name' "$archetypes_path")

# devPlugins → plugins/core/dev/<name>
while IFS= read -r name; do
  filepath="$plugins_dir/core/dev/$name"
  hash="$(compute_hash "$filepath")"
  if [[ -z "$hash" ]]; then
    echo "[warn] Dev plugin file not found: $filepath" >&2
  fi
  $first || hashes_json+=","
  first=false
  hashes_json+="$(printf '%s' "dev/$name" | jq -Rs .): $(printf '%s' "$hash" | jq -Rs .)"
done < <(jq -r '.devPlugins[].name' "$archetypes_path")

# archetypes[].plugins → plugins/archetypes/<id>/main/<name>
while IFS=$'\t' read -r aid name; do
  filepath="$plugins_dir/archetypes/$aid/main/$name"
  hash="$(compute_hash "$filepath")"
  if [[ -z "$hash" ]]; then
    echo "[warn] Archetype plugin file not found: $filepath" >&2
  fi
  $first || hashes_json+=","
  first=false
  hashes_json+="$(printf '%s' "arch/$aid/$name" | jq -Rs .): $(printf '%s' "$hash" | jq -Rs .)"
done < <(jq -r '.archetypes[] | .id as $aid | .plugins[] | "\($aid)\t\(.name)"' "$archetypes_path")

# devArchetypes[].plugins → plugins/archetypes/<id>/dev/<name>
while IFS=$'\t' read -r aid name; do
  filepath="$plugins_dir/archetypes/$aid/dev/$name"
  hash="$(compute_hash "$filepath")"
  if [[ -z "$hash" ]]; then
    echo "[warn] Dev archetype plugin file not found: $filepath" >&2
  fi
  $first || hashes_json+=","
  first=false
  hashes_json+="$(printf '%s' "devarch/$aid/$name" | jq -Rs .): $(printf '%s' "$hash" | jq -Rs .)"
done < <(jq -r '(.devArchetypes // [])[] | .id as $aid | .plugins[] | "\($aid)\t\(.name)"' "$archetypes_path")

hashes_json+="}"

# Update archetypes.json: set .hash on every plugin object
tmp_json="$(mktemp)"
trap 'rm -f "$tmp_json"' EXIT

jq -n --slurpfile arch "$archetypes_path" --argjson h "$hashes_json" '
  ($arch[0]) as $a
  | $a
  | .corePlugins |= map(.name as $n | .hash = ($h["core/" + $n] // ""))
  | .devPlugins |= map(.name as $n | .hash = ($h["dev/" + $n] // ""))
  | (.archetypes // []) |= map(.id as $aid | .plugins |= map(.name as $n | .hash = ($h["arch/" + $aid + "/" + $n] // "")))
  | (.devArchetypes // []) |= map(.id as $aid | .plugins |= map(.name as $n | .hash = ($h["devarch/" + $aid + "/" + $n] // "")))
' > "$tmp_json"

if [[ "$dry_run" == true ]]; then
  if ! cmp -s "$archetypes_path" "$tmp_json"; then
    echo "[dry-run] Would update hashes in archetypes.json"
  else
    echo "[dry-run] No hash changes in archetypes.json"
  fi
  exit 0
fi

if ! cmp -s "$archetypes_path" "$tmp_json"; then
  cp "$tmp_json" "$archetypes_path"
  echo "[info] Updated plugin hashes in archetypes.json"
else
  echo "[info] No hash changes in archetypes.json"
fi

exit 0
