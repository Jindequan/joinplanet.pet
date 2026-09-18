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

# 两个并发请求共用同一键时，数据库事务必须只创建一个 Family，并让
# 重试方收到同一资源。这是顺序重复调用无法覆盖的竞态回归。
CONCURRENT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/planet-idempotency.XXXXXX")"
trap 'rm -rf "$CONCURRENT_DIR"' EXIT
CONCURRENT_KEY="logic-concurrent-family-$TS"
for attempt in 1 2; do
  (request_with_status POST /api/v1/families "$TA" '{"name":"Concurrent Family","timezone":"Asia/Shanghai"}' "$CONCURRENT_KEY" > "$CONCURRENT_DIR/$attempt") &
done
wait
CONCURRENT_ONE=$(cat "$CONCURRENT_DIR/1")
CONCURRENT_TWO=$(cat "$CONCURRENT_DIR/2")
CONCURRENT_STATUS_ONE=$(status_part <<<"$CONCURRENT_ONE")
CONCURRENT_STATUS_TWO=$(status_part <<<"$CONCURRENT_TWO")
CONCURRENT_BODY_ONE=$(body_part <<<"$CONCURRENT_ONE")
CONCURRENT_BODY_TWO=$(body_part <<<"$CONCURRENT_TWO")
CONCURRENT_ID_ONE=$(jq -r '.family.id // empty' <<<"$CONCURRENT_BODY_ONE")
CONCURRENT_ID_TWO=$(jq -r '.family.id // empty' <<<"$CONCURRENT_BODY_TWO")
if [ "$CONCURRENT_STATUS_ONE" = 201 ] && [ "$CONCURRENT_STATUS_TWO" = 201 ] && \
   [ -n "$CONCURRENT_ID_ONE" ] && [ "$CONCURRENT_ID_ONE" = "$CONCURRENT_ID_TWO" ]; then
  ok "concurrent create with one key returns one Family"
else
  bad "concurrent create with one key returns one Family" "status=$CONCURRENT_STATUS_ONE/$CONCURRENT_STATUS_TWO ids=$CONCURRENT_ID_ONE/$CONCURRENT_ID_TWO"
fi

echo "== 配额与归档 =="
R=$(request POST /api/v1/families "$TA" '{"name":"Logic Family","timezone":"Asia/Singapore"}' "logic-family-$TS")
CIRCLE=$(jq -r '.family.id' <<<"$R")
INVITE=$(jq -r '.invite_code' <<<"$R")
check "create Family" '.family.id and .invite_code' "$R"
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"LogicFox","species":"dog"}' "logic-pet-$TS-1")
PET1=$(jq -r '.pet.id' <<<"$R")
check "create first Pet" '.pet.id and .pet.name == "LogicFox"' "$R"
R=$(request POST /api/v1/families/join "$TB" "{\"code\":\"$INVITE\"}" "logic-join-$TS-b" 10.20.0.1)
check "second member joins" '.family.id' "$R"
R=$(request_with_status POST /api/v1/families/join "$TC" "{\"code\":\"$INVITE\"}" "logic-join-$TS-c" 10.20.0.2)
STATUS=$(status_part <<<"$R"); check "member quota is enforced" '.error.code == "QUOTA_MEMBERS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "member quota returns 403" || bad "member quota returns 403" "$STATUS"
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Second","species":"cat"}' "logic-pet-$TS-2")
PET2=$(jq -r '.pet.id' <<<"$R")
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Third","species":"cat"}' "logic-pet-$TS-3")
PET3=$(jq -r '.pet.id' <<<"$R")
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Fourth","species":"cat"}' "logic-pet-$TS-4")
PET4=$(jq -r '.pet.id' <<<"$R")
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Fifth","species":"cat"}' "logic-pet-$TS-5")
PET5=$(jq -r '.pet.id' <<<"$R")
R=$(request_with_status POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Overflow","species":"cat"}' "logic-pet-$TS-6")
STATUS=$(status_part <<<"$R"); check "Pet quota is enforced" '.error.code == "QUOTA_PETS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "Pet quota returns 403" || bad "Pet quota returns 403" "$STATUS"
R=$(request POST "/api/v1/pets/$PET2/archive" "$TA")
check "archive frees an active slot" '.pet.archived_at != null' "$R"
R=$(request POST "/api/v1/families/$CIRCLE/pets" "$TA" '{"name":"Overflow","species":"cat"}' "logic-pet-$TS-6-replacement")
PET6=$(jq -r '.pet.id' <<<"$R")
check "archived Pet frees quota" '.pet.id' "$R"
R=$(request_with_status POST "/api/v1/pets/$PET2/unarchive" "$TA" "" "logic-unarchive-$TS-over")
STATUS=$(status_part <<<"$R"); check "unarchive cannot exceed quota" '.error.code == "QUOTA_PETS_EXCEEDED"' "$(body_part <<<"$R")"; [ "$STATUS" = 403 ] && ok "unarchive quota returns 403" || bad "unarchive quota returns 403" "$STATUS"
R=$(request DELETE "/api/v1/pets/$PET3" "$TA" "{\"confirm\":\"$PET3\"}")
[ -z "$R" ] && ok "permanent Pet delete requires explicit confirmation" || bad "permanent Pet delete" "$R"
R=$(request POST "/api/v1/pets/$PET2/unarchive" "$TA" "" "logic-unarchive-$TS-final")
check "unarchive succeeds after freeing slot" '.pet.archived_at == null' "$R"

echo "== 事件、用药与分享 =="
R=$(request POST "/api/v1/pets/$PET1/timeline" "$TA" '{"type":"vaccine","occurred_at":"2026-08-21T08:00:00Z","payload":{"name":"Rabies vaccine","next_due":"2027-08-01"}}' "logic-event-$TS-1")
check "timeline validates and records vaccine" '.event.type == "vaccine"' "$R"
R=$(request POST "/api/v1/pets/$PET1/medications" "$TA" '{"name":"TestMed","dose":"5mg","schedule":"daily"}' "logic-med-$TS-1")
MED=$(jq -r '.medication.id' <<<"$R")
check "medication creates with idempotency" '.medication.id and .medication.ended_on == null' "$R"
R=$(request POST "/api/v1/medications/$MED/stop" "$TA" '{}' "logic-med-stop-$TS-1")
check "stopping medication records ended_on" '.medication.ended_on != null' "$R"
R=$(request POST "/api/v1/medications/$MED/stop" "$TA" '{}' "logic-med-stop-$TS-1")
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
R=$(request GET "/api/v1/families/$CIRCLE/usage" "$TA")
check "usage exposes quota state" '.pet_max and .member_max' "$R"
for pet_id in "$PET1" "$PET2" "$PET3" "$PET4" "$PET5" "$PET6"; do
  request DELETE "/api/v1/pets/$pet_id" "$TA" "{\"confirm\":\"$pet_id\"}" >/dev/null
done
request DELETE /api/v1/account "$TA" "{\"confirm\":\"$OWNER\"}" >/dev/null
request DELETE /api/v1/account "$TB" "{\"confirm\":\"$CAREGIVER\"}" >/dev/null
request DELETE /api/v1/account "$TC" "{\"confirm\":\"$THIRD\"}" >/dev/null
for token in "$TA" "$TB" "$TC"; do
  R=$(request_with_status GET /api/v1/me "$token")
  STATUS=$(status_part <<<"$R")
  [ "$STATUS" = 401 ] || { bad "deleted account token is rejected" "$STATUS"; exit 1; }
done
ok "test accounts and data cleaned; old tokens return 401"

echo "== 汇总 =="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
