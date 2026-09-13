#!/usr/bin/env bash
# Send a real APNs notification sample to the booted PLANET iOS simulator.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
DEVICE="${2:-booted}"
REQUEST_ID="${1:-}"

if [[ ! "$REQUEST_ID" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  echo "usage: $0 <care_request_id> [device-or-booted]" >&2
  exit 2
fi

PAYLOAD="$(mktemp "${TMPDIR:-/tmp}/planet-care-request.XXXXXX.apns")"
trap 'find "$PAYLOAD" -prune -delete' EXIT

printf '%s\n' '{' \
  '  "Simulator Target Bundle": "pet.joinplanet.app",' \
  '  "aps": {' \
  '    "alert": {' \
  '      "title": "家人把「遛狗」交给你",' \
  '      "body": "请选一个处理方式：今天 18:00 · 遛狗 · 我今天加班，麻烦你来做"' \
  '    },' \
  '    "category": "care_request",' \
  "    \"thread-id\": \"${REQUEST_ID}\"," \
  '    "sound": "default"' \
  '  },' \
  '  "data": {' \
  '    "kind": "care_request",' \
  "    \"care_request_id\": \"${REQUEST_ID}\"," \
  '    "occurrence_id": "simulator-acceptance"' \
  '  }' \
  '}' > "$PAYLOAD"

if ! push_output="$(DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl push "$DEVICE" pet.joinplanet.app "$PAYLOAD" 2>&1)"; then
  if [[ "$push_output" == *"UNErrorDomain, code=2003"* || "$push_output" == *"Source is not authorized"* ]]; then
    echo "notification permission is not authorized for pet.joinplanet.app on $DEVICE; grant permission in the Simulator UI, then retry" >&2
  else
    printf '%s\n' "$push_output" >&2
  fi
  exit 1
fi
echo "sent care_request_id=$REQUEST_ID device=$DEVICE"
