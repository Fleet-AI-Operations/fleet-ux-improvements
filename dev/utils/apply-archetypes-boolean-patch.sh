#!/usr/bin/env bash
#
# apply-archetypes-boolean-patch.sh — Merge validated boolean patches into archetypes.json
#
# Patch format (JSON array):
#   [{ "op": "set_boolean", "path": ["logs","debug"], "value": true }, ...]
#
# Path rules (jq getpath/setpath segments):
#   - Top-level boolean: ["coreOnlyMode"], ["extensionPingEveryLoad"], etc.
#   - Logs: ["logs", "<key>"] where <key> is a direct child of logs
#   - Core plugin: ["corePlugins", <index>, "<key>"]
#   - Dev plugin: ["devPlugins", <index>, "<key>"]
#   - Archetype plugin: ["archetypes", <a>, "plugins", <p>, "<key>"]
#
# Each path must exist in the current file and resolve to a JSON boolean.
# Each value must be a JSON boolean.
#
# Output: full merged archetypes.json on stdout.
# If any boolean value changed, archetypesVersion is bumped by 0.1 (same rule as
# toggle-core-only-mode.sh). If patches are no-ops, the original file is echoed
# unchanged (including archetypesVersion).
#
# Usage:
#   ./apply-archetypes-boolean-patch.sh <archetypes.json> <patch.json>
#
# Exits non-zero if validation or jq fails.
#

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <archetypes.json> <patch.json>" >&2
  exit 1
fi

arch_path="$1"
patch_path="$2"

if ! command -v jq &>/dev/null; then
  echo "[error] jq is required but not installed." >&2
  exit 1
fi

if [[ ! -f "$arch_path" ]]; then
  echo "[error] archetypes.json not found: $arch_path" >&2
  exit 1
fi

if [[ ! -f "$patch_path" ]]; then
  echo "[error] patch file not found: $patch_path" >&2
  exit 1
fi

tmp_merged="$(mktemp)"
trap 'rm -f "$tmp_merged"' EXIT

jq --slurpfile root "$arch_path" --argjson plist "$(cat "$patch_path")" '
  ($plist | if type != "array" then error("patch file must be a JSON array") else . end) as $patches
  | reduce $patches[] as $p ($root[0];
      if $p.op != "set_boolean" then error("invalid op: \($p.op)")
      elif ($p.path | type) != "array" then error("path must be a JSON array")
      elif ($p.path | length) < 1 then error("path must be non-empty")
      elif ($p.value | type) != "boolean" then error("value must be boolean")
      else
        ($p.path | getpath(.)) as $cur
        | if $cur == null then error("path not found: \($p.path)")
          elif ($cur | type) != "boolean" then error("not a boolean at path: \($p.path)")
          else setpath($p.path; $p.value)
          end
      end
    )
' >"$tmp_merged"

# Compare canonical JSON (exclude ordering noise); if identical to input, no bump
if jq -e -S . "$arch_path" >/dev/null 2>&1 && [[ "$(jq -cS . "$arch_path")" == "$(jq -cS . "$tmp_merged")" ]]; then
  cat "$arch_path"
  exit 0
fi

jq '
  .archetypesVersion = (
    .archetypesVersion
    | split(".")
    | (.[1] |= ((tonumber? // 0) + 1 | tostring))
    | join(".")
  )
' "$tmp_merged"
