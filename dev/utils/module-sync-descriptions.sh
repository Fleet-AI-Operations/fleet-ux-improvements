#!/bin/bash
#
# sync-descriptions.sh — Sync dev/descriptions.json with plugin name/description in .js files.
#
# Usage:
#   ./dev/utils/sync-descriptions.sh [--dry-run]
#
# Options:
#   --dry-run  Log what would be added or applied; do not write files or run update-versions.sh.
#
# Effects:
#   1. Builds a tree of plugins (core/main, core/dev, archetypes/*/main, archetypes/*/dev).
#   2. Adds any new module found in the tree to dev/descriptions.json (from live .js name/description).
#   3. For each entry in descriptions.json, if the live .js name/description differs, logs and applies it.
#   4. If any file was changed, runs ./dev/utils/update-versions.sh.
#
# Prerequisites: Node (for sync-descriptions.js). Run from anywhere inside the repo.
#

set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
node_script="$script_dir/z-sync-descriptions.js"
update_script="$script_dir/update-versions.sh"

dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
  shift
fi

if [[ ! -f "$node_script" ]]; then
  echo "[error] sync-descriptions.js not found: $node_script" >&2
  exit 1
fi

args=("$root")
if [[ "$dry_run" == true ]]; then
  args+=(--dry-run)
fi

if node "$node_script" "${args[@]}"; then
  exit_code=0
else
  exit_code=$?
fi

# Exit code 1 from sync-descriptions.js means "changes were made" (not an error).
if [[ $exit_code -eq 1 ]]; then
  if [[ "$dry_run" == true ]]; then
    echo "[dry-run] Would run: $update_script --dry-run" >&2
    "$update_script" --dry-run
  else
    "$update_script"
  fi
  exit 0
fi

exit $exit_code
