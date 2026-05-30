#!/bin/bash
#
# encrypt-ops-bundle.sh — Encrypt local/ops-bundle.json → ops-secrets.enc.json
#
# Password: local/PostgREST/password (see local/PostgREST/OPS-ENCRYPT-INSTRUCTIONS.md)
#
# Usage:
#   ./dev/utils/encrypt-ops-bundle.sh encrypt
#   ./dev/utils/encrypt-ops-bundle.sh decrypt
#

set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  exec node "$script_dir/encrypt-ops-bundle.mjs" --help
fi

if [[ "$cmd" == "encrypt" || "$cmd" == "decrypt" ]]; then
  exec node "$script_dir/encrypt-ops-bundle.mjs" "$@"
fi

if [[ "$cmd" == "--password" ]]; then
  shift
  exec node "$script_dir/encrypt-ops-bundle.mjs" encrypt --password "${1:-}"
fi

exec node "$script_dir/encrypt-ops-bundle.mjs" encrypt --password "$cmd"
