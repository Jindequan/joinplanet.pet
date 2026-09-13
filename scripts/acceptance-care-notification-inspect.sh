#!/usr/bin/env bash
# Inspect the iOS simulator's delivered-notification store after a push sample.
# This proves that SpringBoard received the PLANET category/data; it does not
# replace visual lock-screen/notification-center button evidence.
set -euo pipefail

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
DEVICE="${2:-booted}"
KIND="${1:-}"
EXPECTED_ID="${3:-}"

case "$KIND" in
  care_request|care_handoff_batch) ;;
  *)
    echo "usage: $0 <care_request|care_handoff_batch> [device-or-booted] [expected-id]" >&2
    exit 2
    ;;
esac

sim_data="$(DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl getenv "$DEVICE" HOME)"
notification_root="$sim_data/Library/UserNotifications"
[[ -d "$notification_root" ]] || {
  echo "notification store not found for device $DEVICE" >&2
  exit 1
}

# Runtime proof that the installed PLANET binary registered the actionable
# category before delivery. Categories.plist is an NSKeyedArchive, so strings
# is the portable way to inspect it without depending on private schemas.
category_found=0
while IFS= read -r -d '' categories; do
  category_strings="$(strings "$categories" 2>/dev/null || true)"
  if [[ "$category_strings" == *"$KIND"* ]]; then
    if [[ "$KIND" == care_request && "$category_strings" == *"care_accept"* && "$category_strings" == *"care_decline"* && "$category_strings" == *"care_delegate"* ]]; then
      category_found=1
      break
    fi
    if [[ "$KIND" == care_handoff_batch && "$category_strings" == *"care_batch_accept"* && "$category_strings" == *"care_batch_decline"* && "$category_strings" == *"care_batch_delegate"* ]]; then
      category_found=1
      break
    fi
  fi
done < <(find "$notification_root" -name 'Categories.plist' -print0)

if [[ "$category_found" != 1 ]]; then
  echo "registered PLANET notification category/actions not found for kind=$KIND" >&2
  exit 1
fi
echo "registered PLANET notification actions kind=$KIND"

found=0
while IFS= read -r -d '' plist; do
  xml="$(plutil -convert xml1 -o - "$plist" 2>/dev/null || true)"
  if [[ "$xml" != *"<string>$KIND</string>"* ]]; then
    continue
  fi
  if [[ -n "$EXPECTED_ID" ]]; then
    # DeliveredNotifications.plist is an archived NSKeyedArchive: payload
    # keys and values are stored in parallel UID arrays, so they are not
    # adjacent XML nodes. Requiring the exact id in the same matching plist
    # proves this notification carries the requested business object.
    if [[ "$xml" != *"$EXPECTED_ID"* ]]; then
      continue
    fi
  fi
  if [[ "$xml" == *"<string>$KIND</string>"* ]]; then
    echo "found delivered PLANET notification kind=$KIND"
    [[ -n "$EXPECTED_ID" ]] && echo "payload_id=$EXPECTED_ID"
    echo "store=$plist"
    found=1
    break
  fi
done < <(find "$notification_root" -name 'DeliveredNotifications.plist' -print0)

if [[ "$found" != 1 ]]; then
  echo "no delivered PLANET notification found for kind=$KIND" >&2
  exit 1
fi
