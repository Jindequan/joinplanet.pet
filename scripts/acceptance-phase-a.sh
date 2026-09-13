#!/usr/bin/env bash
# Phase A acceptance against a running dev API (default :8081).
# Usage: ./scripts/acceptance-phase-a.sh [base_url]
set -euo pipefail

BASE="${1:-http://127.0.0.1:8081/api/v1}"
EMAIL="phase-a-$(date +%s)@test.planet"
KEY="phase-a-$(date +%s)"

json() { python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), indent=2, ensure_ascii=False))' 2>/dev/null || cat; }
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== Phase A acceptance =="
echo "API: $BASE"

curl -fsS "$BASE/../healthz" >/dev/null 2>&1 || curl -fsS "${BASE%/api/v1}/healthz" >/dev/null || fail "API not reachable at $BASE"

RC=$(curl -fsS -X POST "$BASE/auth/request-code" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
CODE=$(echo "$RC" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("dev_code",""))')
[ -n "$CODE" ] || fail "no dev_code — start API with DEV_AUTH_CODES=1"

AUTH=$(curl -fsS -X POST "$BASE/auth/verify-code" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\",\"device\":\"acceptance\"}")
TOKEN=$(echo "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
echo "✓ login"

auth() { curl -fsS "$@" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'; }

FAM=$(auth -X POST "$BASE/families" -H "Idempotency-Key: $KEY-fam" \
  -d '{"name":"验收家庭","timezone":"Asia/Shanghai"}')
FAMILY_ID=$(echo "$FAM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["family"]["id"])')
echo "✓ family $FAMILY_ID"

PET=$(auth -X POST "$BASE/families/$FAMILY_ID/pets" -H "Idempotency-Key: $KEY-pet" \
  -d '{"name":"Milo","species":"dog"}')
PET_ID=$(echo "$PET" | python3 -c 'import json,sys; print(json.load(sys.stdin)["pet"]["id"])')
echo "✓ pet $PET_ID"

PLAN=$(auth -X POST "$BASE/pets/$PET_ID/care-plans" -H "Idempotency-Key: $KEY-plan" \
  -d '{"type":"feeding","title":"早餐","rule":{"type":"daily","time":"08:00"}}')
TASK_ID=$(echo "$PLAN" | python3 -c 'import json,sys; b=json.load(sys.stdin); print(b["task"]["id"])')
echo "✓ care plan task $TASK_ID"

TODAY=$(auth "$BASE/today?pet_id=$PET_ID")
echo "$TODAY" | python3 -c "
import json,sys
b=json.load(sys.stdin)
tid='$TASK_ID'
for g in b.get('pets',[]):
  for it in g.get('items',[]):
    if it.get('task',{}).get('id')==tid and it.get('log') is None:
      sys.exit(0)
sys.exit('task not pending in today')
" || fail "today missing pending task"
echo "✓ today lists pending task"

COMPLETE=$(auth -X POST "$BASE/care-tasks/$TASK_ID/complete" -H "Idempotency-Key: $KEY-done" \
  -d '{"status":"done"}')
echo "$COMPLETE" | python3 -c 'import json,sys; json.load(sys.stdin)["log"]' >/dev/null || fail "complete failed"
echo "✓ completed care task"

TL=$(auth "$BASE/timeline?pet_id=$PET_ID")
echo "$TL" | python3 -c "
import json,sys
b=json.load(sys.stdin)
events=b.get('events',[])
if not events: raise SystemExit('no timeline events')
e=events[0]
if e.get('source')!='auto:care': raise SystemExit('expected auto:care')
if e.get('payload',{}).get('care_task_id')!='$TASK_ID': raise SystemExit('wrong task id')
" || fail "timeline missing care event"
echo "✓ timeline shows auto:care event"

ALL=$(auth "$BASE/today")
echo "$ALL" | python3 -c 'import json,sys; json.load(sys.stdin)["pets"]' >/dev/null || fail "all-scope today failed"
echo "✓ all-scope today OK"

echo ""
echo "PASS — Phase A acceptance path verified end-to-end"
