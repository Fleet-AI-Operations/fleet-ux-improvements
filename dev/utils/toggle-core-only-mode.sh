#!/usr/bin/env bash
#
# toggle-core-only-mode.sh — Set archetypes.json coreOnlyMode and bump archetypesVersion on change
#
# Usage:
#   ./utils/toggle-core-only-mode.sh -t|-f [-c]
#   ./utils/toggle-core-only-mode.sh -tc|-ct|-fc|-cf
#
# Arguments (required; mode is not applied without exactly one of -t or -f):
#   -t   Enable core-only mode (archetype UX plugins off; core plugins remain).
#   -f   Disable core-only mode.
#   -c   After a successful toggle, git commit archetypes.json with an appropriate message.
#
# Effects:
#   1. Updates archetypes.json field coreOnlyMode to true or false.
#   2. If and only if that value changed, bumps archetypesVersion by 0.1 (minor;
#      same rule as update-versions.sh: increment the segment after the dot, e.g. 6.94 -> 6.95).
#   3. With -c, commits only when step 1 changed the file; otherwise logs that there is nothing to commit.
#
# Prerequisites: jq (must be on PATH). Repo root is derived from git.
#

set -euo pipefail

want_json=""
commit_after=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t)
      if [[ -n "$want_json" ]]; then
        echo "[error] Specify only one of -t or -f" >&2
        exit 1
      fi
      want_json='true'
      shift
      ;;
    -f)
      if [[ -n "$want_json" ]]; then
        echo "[error] Specify only one of -t or -f" >&2
        exit 1
      fi
      want_json='false'
      shift
      ;;
    -c)
      commit_after=true
      shift
      ;;
    -tc|-ct)
      if [[ -n "$want_json" ]]; then
        echo "[error] Specify only one of -t or -f" >&2
        exit 1
      fi
      want_json='true'
      commit_after=true
      shift
      ;;
    -fc|-cf)
      if [[ -n "$want_json" ]]; then
        echo "[error] Specify only one of -t or -f" >&2
        exit 1
      fi
      want_json='false'
      commit_after=true
      shift
      ;;
    *)
      echo "Usage: $0 [-c] -t|-f   or   $0 -tc|-ct|-fc|-cf" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$want_json" ]]; then
  echo "Usage: $0 [-c] -t|-f   or   $0 -tc|-ct|-fc|-cf" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
archetypes_path="$root/archetypes.json"
archetypes_rel="archetypes.json"

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
  if [[ "$commit_after" == true ]]; then
    echo "[info] No commit (-c): archetypes.json was already in the requested state"
  fi
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

if [[ "$want_json" == 'true' ]]; then
  mode_phrase="Enable core-only mode"
else
  mode_phrase="Disable core-only mode"
fi

if [[ "$commit_after" == true ]]; then
  git -C "$root" add -- "$archetypes_path"
  git -C "$root" commit -m "$mode_phrase in archetypes.json" -m "Set coreOnlyMode to $want_json and bump archetypesVersion ($old_ver -> $new_ver)."
  echo "[info] Committed $archetypes_rel"
fi
