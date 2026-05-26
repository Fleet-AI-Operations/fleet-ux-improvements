#!/bin/bash
#
# encrypt-ops-secrets.sh — Encrypt local/ops-secrets.json → ops-secrets.enc.json
#
# Usage:
#   ./dev/utils/encrypt-ops-secrets.sh encrypt [--password 'secret']
#   ./dev/utils/encrypt-ops-secrets.sh decrypt [--password 'secret']
# Convenience:
#   ./dev/utils/encrypt-ops-secrets.sh 'secret'              # implies: encrypt --password 'secret'
#   ./dev/utils/encrypt-ops-secrets.sh --password 'secret'   # implies: encrypt --password 'secret'
#

set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  exec node "$script_dir/encrypt-ops-secrets.mjs" --help
fi

if [[ "$cmd" == "encrypt" || "$cmd" == "decrypt" ]]; then
  exec node "$script_dir/encrypt-ops-secrets.mjs" "$@"
fi

# If called without an explicit command, default to "encrypt".
# Support either:
#   encrypt-ops-secrets.sh PASSWORD
#   encrypt-ops-secrets.sh --password PASSWORD
if [[ "$cmd" == "--password" ]]; then
  shift
  exec node "$script_dir/encrypt-ops-secrets.mjs" encrypt --password "${1:-}"
fi

exec node "$script_dir/encrypt-ops-secrets.mjs" encrypt --password "$cmd"
