#!/usr/bin/env bash
#
# toggle-core-only-mode.sh — Set archetypes.json coreOnlyMode and bump archetypesVersion on change
#
# Usage:
#   ./utils/toggle-core-only-mode.sh -t   # set coreOnlyMode to true
#   ./utils/toggle-core-only-mode.sh -f   # set coreOnlyMode to false
#
# Arguments (required; the script does nothing without exactly one of these):
#   -t   Enable core-only mode (archetype UX plugins off; core plugins remain).
#   -f   Disable core-only mode.
#
# Effects:
#   1. Updates archetypes.json field coreOnlyMode to true or false.
#   2. If and only if that value changed, bumps archetypesVersion by 0.1 (minor;
#      same rule as update-versions.sh: increment the segment after the dot, e.g. 6.94 -> 6.95).
#
# Prerequisites: jq (must be on PATH). Repo root is derived from git.
#

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 -t|-f" >&2
  exit 1
fi

want_json=""
case "$1" in
  -t) want_json='true' ;;
  -f) want_json='false' ;;
  *)
    echo "Usage: $0 -t|-f" >&2
    exit 1
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
archetypes_path="$root/archetypes.json"

if ! command -v jq &>/dev/null; then
  echo "[error] jq is required but not installed." >&2
  exit 1
fi

if [[ ! -f "$archetypes_path" ]]; then
  echo "[error] archetypes.json not found: $archetypes_path" >&2
  exit 1
fi

if jq -e --argjson want "$want_json" '(.coreOnlyMode // false) == $want' "$archetypes_path" >/dev/null 2>&1; then
  echo "[info] coreOnlyMode already $want_json; no changes to $archetypes_path"
  exit 0
fi

tmp_out="$(mktemp)"
trap 'rm -f "$tmp_out"' EXIT

jq --argjson want "$want_json" '
  .coreOnlyMode = $want
  | .archetypesVersion = (
      .archetypesVersion
      | split(".")
      | (.[1] |= ((tonumber? // 0) + 1 | tostring))
      | join(".")
    )
' "$archetypes_path" > "$tmp_out"

old_ver="$(jq -r '.archetypesVersion // ""' "$archetypes_path")"
new_ver="$(jq -r '.archetypesVersion // ""' "$tmp_out")"
cp "$tmp_out" "$archetypes_path"
echo "[info] coreOnlyMode -> $want_json; archetypesVersion: \"$old_ver\" -> \"$new_ver\""
