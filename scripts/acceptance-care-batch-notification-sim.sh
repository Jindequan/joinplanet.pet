#!/usr/bin/env bash
# Send a grouped shift-handoff notification sample to the booted PLANET iOS simulator.
set -euo pipefail

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
DEVICE="${2:-booted}"
BATCH_ID="${1:-}"

if [[ ! "$BATCH_ID" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  echo "usage: $0 <care_handoff_batch_id> [device-or-booted]" >&2
  exit 2
fi

PAYLOAD="$(mktemp "${TMPDIR:-/tmp}/planet-care-batch.XXXXXX.apns")"
trap 'find "$PAYLOAD" -prune -delete' EXIT

printf '%s\n' '{' \
  '  "Simulator Target Bundle": "pet.joinplanet.app",' \
  '  "aps": {' \
  '    "alert": {' \
  '      "title": "家人把 3 项照护交给你",' \
  '      "body": "请选你能做的：共 3 项 · Milo · 遛狗 18:00；还有 2 项"' \
  '    },' \
  '    "category": "care_handoff_batch",' \
  "    \"thread-id\": \"${BATCH_ID}\"," \
  '    "sound": "default"' \
  '  },' \
  '  "data": {' \
  '    "kind": "care_handoff_batch",' \
  "    \"care_batch_id\": \"${BATCH_ID}\"" \
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
echo "sent care_batch_id=$BATCH_ID device=$DEVICE"
