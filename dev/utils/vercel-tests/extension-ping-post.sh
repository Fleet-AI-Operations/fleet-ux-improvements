#!/usr/bin/env bash
#
# extension-ping-post.sh — Send a test ping to extension-ping endpoint
#
# Usage:
#   ./dev/utils/extension-ping-post.sh [email]
#
# Examples:
#   ./dev/utils/extension-ping-post.sh
#   ./dev/utils/extension-ping-post.sh maxwellturner@gmail.com
#   ./dev/utils/extension-ping-post.sh maxwellturner@gmail.com 1.4.2
#

set -euo pipefail

BASE_URL="https://operations-toolkit-admin.vercel.app"
ENDPOINT="/api/extension-ping"
EMAIL="${1:-test@example.com}"
EXT_VERSION="${2:-1.4.2}"

if [[ "$EMAIL" == "--help" || "$EMAIL" == "-h" ]]; then
  cat <<'EOF'
Usage: extension-ping-post.sh [email] [extensionVersion]

Sends POST https://operations-toolkit-admin.vercel.app/api/extension-ping

Arguments:
  email             Optional. Email in JSON body. Defaults to test@example.com
  extensionVersion  Optional. metadata.extensionVersion. Defaults to 1.4.2

Sample metadata matches the userscript shape: extensionVersion + userAgent string.
EOF
  exit 0
fi

if [[ "$EMAIL" != *"@"* ]]; then
  echo "[error] Invalid email value: $EMAIL" >&2
  exit 1
fi

payload=$(printf '{"email":"%s","metadata":{"extensionVersion":"%s","userAgent":"Mozilla/5.0 (test) Chrome/123.0.6312.86"}}' "$EMAIL" "$EXT_VERSION")

echo "[info] POST ${BASE_URL}${ENDPOINT}"
echo "[info] Payload: $payload"

response=$(
  curl -sS \
    -w '\nHTTP_STATUS:%{http_code}\n' \
    -X POST "${BASE_URL}${ENDPOINT}" \
    -H 'Content-Type: application/json' \
    -d "$payload"
)

status="$(printf '%s' "$response" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r')"
body="$(printf '%s' "$response" | sed '/^HTTP_STATUS:/d')"

echo "[info] Status: ${status:-unknown}"
echo "$body"
