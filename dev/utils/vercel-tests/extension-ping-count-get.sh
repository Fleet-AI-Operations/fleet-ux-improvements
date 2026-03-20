#!/usr/bin/env bash
#
# extension-ping-count-get.sh — Fetch extension ping count
#
# Usage:
#   ./dev/utils/extension-ping-count-get.sh
#

set -euo pipefail

BASE_URL="https://operations-toolkit-admin.vercel.app"
ENDPOINT="/api/extension-ping-count"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage: extension-ping-count-get.sh

Sends GET https://operations-toolkit-admin.vercel.app/api/extension-ping-count
EOF
  exit 0
fi

echo "[info] GET ${BASE_URL}${ENDPOINT}"

response=$(
  curl -sS \
    -w '\nHTTP_STATUS:%{http_code}\n' \
    -X GET "${BASE_URL}${ENDPOINT}"
)

status="$(printf '%s' "$response" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r')"
body="$(printf '%s' "$response" | sed '/^HTTP_STATUS:/d')"

echo "[info] Status: ${status:-unknown}"
echo "$body"
