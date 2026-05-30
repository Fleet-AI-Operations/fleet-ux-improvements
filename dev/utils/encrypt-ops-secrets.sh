#!/bin/bash
#
# encrypt-ops-secrets.sh — Legacy entry point; delegates to encrypt-ops-bundle.sh
#

set -e
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$script_dir/encrypt-ops-bundle.sh" "$@"
