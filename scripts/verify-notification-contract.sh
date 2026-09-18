#!/usr/bin/env bash
# Compile and execute the platform-independent notification identifier checks.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/APP"
API_DIR="$ROOT_DIR/planet-api"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/planet-notification-contract.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$APP_DIR/node_modules/.bin/tsc" \
  --target ES2020 \
  --module commonjs \
  --strict \
  --skipLibCheck \
  --outDir "$TMP_DIR" \
  "$APP_DIR/src/core/notifications/contract.ts"

node - "$TMP_DIR/contract.js" <<'NODE'
const assert = require('node:assert/strict')
const contract = require(process.argv[2])

assert.equal(contract.CARE_NOTIFICATION_CATEGORY.request, 'care_request')
assert.equal(contract.CARE_NOTIFICATION_CATEGORY.batch, 'care_handoff_batch')
assert.equal(contract.careNotificationAction('care_accept'), 'accept')
assert.equal(contract.careNotificationAction('care_batch_accept'), 'accept')
assert.equal(contract.careNotificationAction('care_decline'), 'decline')
assert.equal(contract.careNotificationAction('care_batch_decline'), 'decline')
assert.equal(contract.careNotificationAction('care_delegate'), 'delegate')
assert.equal(contract.careNotificationAction('care_batch_delegate'), 'delegate')
assert.equal(contract.careNotificationAction('expo.notifications.DEFAULT_ACTION'), 'open')
assert.equal(contract.careNotificationCategory('care_request'), 'care_request')
assert.equal(contract.careNotificationCategory('care_handoff_batch'), 'care_handoff_batch')
assert.equal(contract.careNotificationCategory('care_completed'), undefined)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_request', care_request_id: 'req-1' }, 'decline'),
  { surface: 'request', requestId: 'req-1', careAction: 'reassign' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_request', care_request_id: 'req-1' }, 'accept'),
  { surface: 'request', requestId: 'req-1' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_request', care_request_id: 'req-1' }, 'delegate'),
  { surface: 'request', requestId: 'req-1', careAction: 'delegate' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_handoff_batch', care_batch_id: 'batch-1' }, 'accept'),
  { surface: 'batch', batchId: 'batch-1' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_handoff_batch', care_batch_id: 'batch-1' }, 'decline'),
  { surface: 'batch', batchId: 'batch-1', careAction: 'reassign' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_handoff_batch', care_batch_id: 'batch-1' }, 'delegate'),
  { surface: 'batch', batchId: 'batch-1', careAction: 'delegate' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_handoff_batch_status', care_batch_id: 'batch-1' }, 'open'),
  { surface: 'batch', batchId: 'batch-1' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_handoff', care_request_id: 'req-1' }, 'open'),
  { surface: 'request', requestId: 'req-1' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_completed' }, 'open'),
  { surface: 'today' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_reminder', occurrence_id: 'occ-1' }, 'open'),
  { surface: 'today', occurrenceId: 'occ-1' },
)
assert.deepEqual(
  contract.careNotificationRoute({ kind: 'care_alert', occurrence_id: 'occ-2' }, 'open'),
  { surface: 'today', occurrenceId: 'occ-2' },
)
for (const kind of ['care_reminder', 'care_digest', 'care_alert']) {
  assert.deepEqual(contract.careNotificationRoute({ kind }, 'open'), { surface: 'today' })
}
assert.equal(contract.careNotificationRoute({ kind: 'care_request' }, 'open'), undefined)
assert.equal(contract.careNotificationRoute({ kind: 'care_handoff_batch' }, 'open'), undefined)
console.log('PASS — notification category/action contract')
NODE

# The server owns the actual push payload. Keep this executable guard close to
# the client contract so a category rename cannot silently turn action cards
# into passive notifications.
for marker in \
  'categoryID = "care_request"' \
  'categoryID = "care_handoff_batch"' \
  '"kind":            "care_request"' \
  '"kind":          "care_handoff_batch"' \
  'ThreadID string `json:"threadId,omitempty"`'; do
  if ! rg -q "$marker" "$API_DIR/internal/modules/notify/push.go" "$API_DIR/internal/modules/carecoord/service.go"; then
    echo "FAIL — server notification contract drift: $marker" >&2
    exit 1
  fi
done
echo 'PASS — server/client notification categories aligned'

for marker in 'thread-id' 'care_request_id' 'care_batch_id'; do
  if ! rg -q "$marker" "$ROOT_DIR/scripts/acceptance-care-notification-sim.sh" "$ROOT_DIR/scripts/acceptance-care-batch-notification-sim.sh"; then
    echo "FAIL — simulator notification thread contract drift: $marker" >&2
    exit 1
  fi
done
echo 'PASS — actionable notification threads stay isolated per business object'

for script in "$ROOT_DIR/scripts/acceptance-care-notification-sim.sh" "$ROOT_DIR/scripts/acceptance-care-batch-notification-sim.sh"; do
  if ! rg -q 'Source is not authorized' "$script"; then
    echo "FAIL — simulator notification permission failure is not actionable: $script" >&2
    exit 1
  fi
done
echo 'PASS — simulator notification permission failures explain recovery'

for marker in 'registerCareNotificationCategories' 'identifier: "care_request"' 'identifier: "care_handoff_batch"' 'title: "我来做"' 'title: "我也不行"' 'title: "给其他人"'; do
  if ! rg -q "$marker" "$APP_DIR/ios/PLANET/AppDelegate.swift"; then
    echo "FAIL — native iOS notification category contract drift: $marker" >&2
    exit 1
  fi
done
echo 'PASS — iOS categories are registered at native launch'

if rg -n '我今天不行|今晚不行' "$APP_DIR/src"; then
  echo 'FAIL — legacy care action copy remains in APP/src' >&2
  exit 1
fi
if ! rg -q 'CARE_ACTION_LABELS' "$APP_DIR/src/core/presentation/terminology.ts"; then
  echo 'FAIL — care action labels are not centralized' >&2
  exit 1
fi
for label in "accept: '我来做'" "decline: '我也不行'" "delegate: '给其他人'"; do
  if ! rg -q "$label" "$APP_DIR/src/core/presentation/terminology.ts"; then
    echo "FAIL — care action label drift: $label" >&2
    exit 1
  fi
done
if rg -n '暂时不行' "$APP_DIR/src/features/today" "$APP_DIR/src/features/care-requests"; then
  echo 'FAIL — stale decline copy remains in Today/care request UI' >&2
  exit 1
fi
echo 'PASS — care action copy contract'
