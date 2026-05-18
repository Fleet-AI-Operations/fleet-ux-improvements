#!/bin/bash
#
# hash-ops-password.sh — SHA-256 hash for archetypes.json opsAccess.passwordHash
#
# Usage:
#   ./dev/utils/hash-ops-password.sh 'your-password'
#   ./dev/utils/hash-ops-password.sh   # prompts (hidden)
#
# Output format matches plugin integrity hashes: sha256-<hex>

set -e

if ! command -v shasum &>/dev/null; then
  echo "[error] shasum is required but not installed." >&2
  exit 1
fi

password="$1"
if [[ -z "$password" ]]; then
  read -r -s -p "Password: " password
  echo "" >&2
fi

if [[ -z "$password" ]]; then
  echo "[error] Password must not be empty." >&2
  exit 1
fi

hex="$(printf '%s' "$password" | shasum -a 256 | awk '{print $1}')"
echo "sha256-${hex}"
echo "" >&2
echo "Paste into archetypes.json → opsAccess.passwordHash" >&2
