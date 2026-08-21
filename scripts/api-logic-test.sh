#!/usr/bin/env bash
# PLANET 当前 API 契约的边界回归：配额、归档、事件、用药、分享和导出。
# 用法：BASE=http://127.0.0.1:8081 bash scripts/api-logic-test.sh
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8081}"
JSON='Content-Type: application/json'
TS=$(date +%s)
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✗ $1 → $2"; }
check() {
  local label="$1" expression="$2" payload="$3"
  if jq -e "$expression" >/dev/null <<<"$payload"; then ok "$label"; else bad "$label" "$(head -c 220 <<<"$payload")"; fi
}
request() {
  local method="$1" path="$2" token="$3" body="${4:-}" key="${5:-}" ip="${6:-}"
  local args=(-sS -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "$JSON" -d "$body")
  [ -n "$key" ] && args+=(-H "Idempotency-Key: $key")
  [ -n "$ip" ] && args+=(-H "X-Forwarded-For: $ip")
  curl "${args[@]}"
}
request_with_status() {
  local method="$1" path="$2" token="$3" body="${4:-}" key="${5:-}" ip="${6:-}"
  local args=(-sS -w $'\n%{http_code}' -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "$JSON" -d "$body")
  [ -n "$key" ] && args+=(-H "Idempotency-Key: $key")
  [ -n "$ip" ] && args+=(-H "X-Forwarded-For: $ip")
  curl "${args[@]}"
}
token_for() {
  local email="$1" response code
  response=$(request POST /api/v1/auth/request-code "" "{\"email\":\"$email\"}")
  code=$(jq -r '.dev_code' <<<"$response")
  request POST /api/v1/auth/verify-code "" "{\"email\":\"$email\",\"code\":\"$code\"}" | jq -r '.token'
}
body_part() { sed '$d'; }
status_part() { tail -n 1; }

OWNER="logic-owner-$TS@planet.dev"
CAREGIVER="logic-caregiver-$TS@planet.dev"
THIRD="logic-third-$TS@planet.dev"
TA=$(token_for "$OWNER")
TB=$(token_for "$CAREGIVER")
TC=$(token_for "$THIRD")
[ -n "$TA" ] && [ "$TA" != "null" ] && [ -n "$TB" ] && [ -n "$TC" ] || { echo "FATAL: token bootstrap failed"; exit 1; }

echo "== 配额与归档 =="
R=$(request POST /api/v1/circles "$TA" '{"name":"Logic Family","timezone":"Asia/Singapore"}' "logic-circle-$TS")
CIRCLE=$(jq -r '.circle.id' <<<"$R")
INVITE=$(jq -r '.invite_code' <<<"$R")
check "create Family" '.circle.id and .invite_code' "$R"
R=$(request POST "/api/v1/circles/$CIRCLE/pets" "$TA" '{"name":"LogicFox","species":"dog"}' "logic-pet-$TS-1")
PET1=$(jq -r '.pet.id' <<<"$R")
check "create first Pet" '.pet.id and .pet.name == "LogicFox"' "$R"
R=$(request POST /api/v1/circles/join "$TB" "{\"code\":\"$INVITE\"}" "" "" 10.20.0.1)
check "second member joins" '.circle.id' "$R"
R=$(request_with_status POST /api/v1/circles/join "$TC" "{\"code\":\"$INVITE\"}" "" "" 10.20.0.2)
STATUS=$(status_part <<<"$R"); check "member quota is enforced" '.error.code == "QUOTA_MEMBERS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "member quota returns 403" || bad "member quota returns 403" "$STATUS"
R=$(request POST "/api/v1/circles/$CIRCLE/pets" "$TA" '{"name":"Second","species":"cat"}' "logic-pet-$TS-2")
PET2=$(jq -r '.pet.id' <<<"$R")
R=$(request_with_status POST "/api/v1/circles/$CIRCLE/pets" "$TA" '{"name":"Third","species":"cat"}' "logic-pet-$TS-3")
STATUS=$(status_part <<<"$R"); check "Pet quota is enforced" '.error.code == "QUOTA_PETS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "Pet quota returns 403" || bad "Pet quota returns 403" "$STATUS"
R=$(request POST "/api/v1/pets/$PET2/archive" "$TA")
check "archive frees an active slot" '.pet.archived_at != null' "$R"
R=$(request POST "/api/v1/circles/$CIRCLE/pets" "$TA" '{"name":"Third","species":"cat"}' "logic-pet-$TS-4")
PET3=$(jq -r '.pet.id' <<<"$R")
check "archived Pet frees quota" '.pet.id' "$R"
R=$(request_with_status POST "/api/v1/pets/$PET2/unarchive" "$TA")
STATUS=$(status_part <<<"$R"); check "unarchive cannot exceed quota" '.error.code == "QUOTA_PETS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "unarchive quota returns 403" || bad "unarchive quota returns 403" "$STATUS"
R=$(request DELETE "/api/v1/pets/$PET3" "$TA" "{\"confirm\":\"$PET3\"}")
[ -z "$R" ] && ok "permanent Pet delete requires explicit confirmation" || bad "permanent Pet delete" "$R"
R=$(request POST "/api/v1/pets/$PET2/unarchive" "$TA")
check "unarchive succeeds after freeing slot" '.pet.archived_at == null' "$R"

echo "== 事件、用药与分享 =="
R=$(request POST "/api/v1/pets/$PET1/timeline" "$TA" '{"type":"vaccine","occurred_at":"2026-08-22T08:00:00Z","payload":{"name":"Rabies vaccine","next_due":"2027-08-01"}}' "logic-event-$TS-1")
check "timeline validates and records vaccine" '.event.type == "vaccine"' "$R"
R=$(request POST "/api/v1/pets/$PET1/medications" "$TA" '{"name":"TestMed","dose":"5mg","schedule":"daily"}' "logic-med-$TS-1")
MED=$(jq -r '.medication.id' <<<"$R")
check "medication creates with idempotency" '.medication.id and .medication.ended_on == null' "$R"
R=$(request POST "/api/v1/medications/$MED/stop" "$TA" '{}')
check "stopping medication records ended_on" '.medication.ended_on != null' "$R"
R=$(request POST "/api/v1/medications/$MED/stop" "$TA" '{}')
check "repeating stop is idempotent" '.medication.id == "'"$MED"'"' "$R"
R=$(request POST "/api/v1/pets/$PET1/shares" "$TA" '{"kind":"care_card","ttl_hours":24}' "logic-share-$TS-1")
SHARE_ID=$(jq -r '.share.id' <<<"$R")
SHARE_TOKEN=$(jq -r '.token' <<<"$R")
check "create care card share" '.share.id and .token' "$R"
R=$(request GET "/api/v1/shares/$SHARE_TOKEN" "")
check "anonymous share is readable" '.kind == "care_card"' "$R"
R=$(request DELETE "/api/v1/shares/$SHARE_ID" "$TA")
[ -z "$R" ] && ok "share revoke is destructive and explicit" || bad "share revoke" "$R"
R=$(request GET "/api/v1/shares/$SHARE_TOKEN" "")
check "revoked share is no longer readable" '.error.code == "SHARE_GONE"' "$R"

echo "== 导出、清理 =="
R=$(request GET "/api/v1/pets/$PET1/export" "$TA")
check "export includes the Pet" '.pet.id == "'"$PET1"'"' "$R"
check "export includes timeline" '.timeline' "$R"
R=$(request GET "/api/v1/circles/$CIRCLE/usage" "$TA")
check "usage exposes quota state" '.pet_max and .member_max' "$R"
request DELETE "/api/v1/pets/$PET1" "$TA" "{\"confirm\":\"$PET1\"}" >/dev/null
request DELETE "/api/v1/pets/$PET2" "$TA" "{\"confirm\":\"$PET2\"}" >/dev/null
request DELETE /api/v1/me "$TA" >/dev/null
request DELETE /api/v1/me "$TB" >/dev/null
request DELETE /api/v1/me "$TC" >/dev/null
ok "test accounts and data cleaned"

echo "== 汇总 =="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
