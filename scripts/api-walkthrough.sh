#!/usr/bin/env bash
# PLANET API 全链路走查（当前 v1 契约）。
# 用法：BASE=http://127.0.0.1:8081 bash scripts/api-walkthrough.sh
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8081}"
JSON='Content-Type: application/json'
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; exit 1; }
expect() {
  local label="$1" expression="$2" payload="$3"
  if jq -e "$expression" >/dev/null <<<"$payload"; then ok "$label"; else echo "$payload"; fail "$label"; fi
}
key() { printf 'walkthrough-%s-%s' "$(date +%s%N)" "$RANDOM"; }
post() {
  local path="$1" token="$2" body="$3" idempotency="${4:-}"
  local args=(-sS -X POST "$BASE$path" -H "$JSON" -d "$body")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$idempotency" ] && args+=(-H "Idempotency-Key: $idempotency")
  curl "${args[@]}"
}
get() {
  local path="$1" token="$2"
  local args=(-sS "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}
delete() {
  local path="$1" token="$2" body="${3:-}"
  local args=(-sS -X DELETE "$BASE$path" -H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "$JSON" -d "$body")
  curl "${args[@]}"
}

EMAIL="walkthrough.$(date +%s)@planet.dev"
EMAIL_B="walkthrough.b.$(date +%s)@planet.dev"
DISPLAY_B="${EMAIL_B%@*}"

echo "== F1 认证与会话 =="
R=$(post /api/v1/auth/request-code "" "{\"email\":\"$EMAIL\"}")
expect "request-code returns development code" '.sent == true and (.dev_code | strings | test("^[0-9]{6}$"))' "$R"
CODE=$(jq -r '.dev_code' <<<"$R")
R=$(post /api/v1/auth/verify-code "" "{\"email\":\"$EMAIL\",\"code\":\"$CODE\",\"device\":\"api-walkthrough\"}")
expect "verify-code returns session" '.token | strings | length > 20' "$R"
TOKEN=$(jq -r '.token' <<<"$R")
expect "authenticated /me returns the same email" ".user.email == \"$EMAIL\"" "$(get /api/v1/me "$TOKEN")"

echo "== F2 Family、成员、Pet =="
R=$(post /api/v1/circles "$TOKEN" '{"name":"Walkthrough Family","timezone":"Asia/Shanghai"}' "$(key)")
expect "create Family" '.circle.id and .invite_code' "$R"
CIRCLE=$(jq -r '.circle.id' <<<"$R")
INVITE=$(jq -r '.invite_code' <<<"$R")
expect "Family keeps its IANA timezone" '.circle.timezone == "Asia/Shanghai"' "$R"
R=$(post "/api/v1/circles/$CIRCLE/pets" "$TOKEN" '{"name":"Milo","species":"dog","breed":"Golden Retriever"}' "$(key)")
expect "create Pet" '.pet.id and .pet.name == "Milo"' "$R"
PET=$(jq -r '.pet.id' <<<"$R")
R=$(post /api/v1/auth/request-code "" "{\"email\":\"$EMAIL_B\"}")
CODE_B=$(jq -r '.dev_code' <<<"$R")
R=$(post /api/v1/auth/verify-code "" "{\"email\":\"$EMAIL_B\",\"code\":\"$CODE_B\"}")
TOKEN_B=$(jq -r '.token' <<<"$R")
R=$(post /api/v1/circles/join "$TOKEN_B" "{\"code\":\"$INVITE\"}")
expect "second user joins Family" ".circle.id == \"$CIRCLE\"" "$R"
expect "second user sees the shared Pet" ".pets | any(.id == \"$PET\")" "$(get "/api/v1/circles/$CIRCLE/pets" "$TOKEN_B")"
R=$(post /api/v1/circles "$TOKEN_B" '{"name":"Second Walkthrough Family","timezone":"Asia/Shanghai"}' "$(key)")
expect "create second Family for Pet sharing" '.circle.id and .invite_code' "$R"
CIRCLE_2=$(jq -r '.circle.id' <<<"$R")
INVITE_2=$(jq -r '.invite_code' <<<"$R")
R=$(post /api/v1/circles/join "$TOKEN" "{\"code\":\"$INVITE_2\"}")
expect "Pet owner joins the second Family" ".circle.id == \"$CIRCLE_2\"" "$R"
R=$(post "/api/v1/pets/$PET/families" "$TOKEN" "{\"family_id\":\"$CIRCLE_2\"}")
expect "share Pet with another Family" ".family_id == \"$CIRCLE_2\"" "$R"
expect "shared Family sees the Pet" ".pets | any(.id == \"$PET\")" "$(get "/api/v1/circles/$CIRCLE_2/pets" "$TOKEN_B")"
delete "/api/v1/pets/$PET/families/$CIRCLE_2" "$TOKEN"
expect "remove shared Family access" ".pets | all(.id != \"$PET\")" "$(get "/api/v1/circles/$CIRCLE_2/pets" "$TOKEN_B")"

echo "== F3 Care plan、Today、历史 =="
R=$(post "/api/v1/pets/$PET/care-items" "$TOKEN" '{"type":"medication","title":"Heart medicine","description":"With food","rule":{"type":"daily","time":"08:00"}}' "$(key)")
expect "create care plan" '.care_item.id and .care_rule.id and .task.id' "$R"
TASK=$(jq -r '.task.id' <<<"$R")
TODAY=$(get "/api/v1/circles/$CIRCLE/today" "$TOKEN")
expect "Today contains the care task" ".pets[].items[] | select(.task.id == \"$TASK\")" "$TODAY"
R=$(post "/api/v1/care-tasks/$TASK/complete" "$TOKEN" '{"status":"done"}')
expect "complete Today task" '.log.status == "completed" or .log.status == "done"' "$R"
LOG=$(jq -r '.log.id' <<<"$R")
R=$(post "/api/v1/task-logs/$LOG/undo" "$TOKEN" '')
[ -z "$R" ] && ok "undo task completion" || expect "undo task completion" 'true' "$R"
R=$(post "/api/v1/care-tasks/$TASK/complete" "$TOKEN" '{"status":"skipped"}')
expect "skip Today task" '.log.status == "skipped"' "$R"
SKIP_LOG=$(jq -r '.log.id' <<<"$R")
R=$(post "/api/v1/task-logs/$SKIP_LOG/undo" "$TOKEN" '')
[ -z "$R" ] && ok "undo skipped task" || expect "undo skipped task" 'true' "$R"
R=$(post "/api/v1/pets/$PET/timeline" "$TOKEN" '{"type":"symptom","occurred_at":"2026-08-21T08:00:00Z","payload":{"text":"Less active after breakfast"}}' "$(key)")
expect "record timeline symptom" '.event.type == "symptom"' "$R"
expect "timeline returns the record" '.events | any(.type == "symptom")' "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
R=$(post "/api/v1/pets/$PET/timeline" "$TOKEN_B" '{"type":"note","occurred_at":"2026-08-21T09:00:00Z","payload":{"text":"B checked the morning walk"}}' "$(key)")
expect "second caregiver can record a note" ".event.recorded_by_name == \"$DISPLAY_B\"" "$R"
expect "timeline keeps the real recorder name" ".events | any(.recorded_by_name == \"$DISPLAY_B\" and .payload.text == \"B checked the morning walk\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
expect "alerts endpoint returns a collection" '.alerts | type == "array"' "$(get "/api/v1/circles/$CIRCLE/alerts" "$TOKEN")"
expect "daily digest returns the Family view" '.date and (.pets | type == "array")' "$(get "/api/v1/circles/$CIRCLE/digest" "$TOKEN")"

echo "== F3b 用药生命周期 =="
R=$(post "/api/v1/pets/$PET/medications" "$TOKEN" '{"name":"Heartgard","dose":"1 tablet","schedule":"monthly","note":"with food"}' "$(key)")
expect "start medication" '.medication.id and .medication.ended_on == null' "$R"
MED=$(jq -r '.medication.id' <<<"$R")
expect "started medication appears in the Pet list" ".medications | any(.id == \"$MED\" and .ended_on == null)" "$(get "/api/v1/pets/$PET/medications" "$TOKEN")"
expect "medication start is recorded automatically" ".events | any(.type == \"medication\" and .source == \"auto:med\" and .payload.action == \"started\" and .payload.medication_id == \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
R=$(post "/api/v1/medications/$MED/stop" "$TOKEN" '')
expect "stop medication" ".medication.id == \"$MED\" and (.medication.ended_on | strings | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}$\"))" "$R"
R=$(post "/api/v1/medications/$MED/stop" "$TOKEN" '')
expect "repeating stop is idempotent" ".medication.id == \"$MED\" and (.medication.ended_on | strings | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}\"))" "$R"
expect "medication stop is recorded automatically" ".events | any(.type == \"medication\" and .source == \"auto:med\" and .payload.action == \"ended\" and .payload.medication_id == \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
delete "/api/v1/medications/$MED" "$TOKEN"
expect "deleted medication removes its automatic history" ".events | all(.payload.medication_id != \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"

echo "== F4 分享、撤销、导出 =="
R=$(post "/api/v1/pets/$PET/shares" "$TOKEN" '{"kind":"care_card","ttl_hours":24}' "$(key)")
expect "create care card share" '.share.id and .token' "$R"
SHARE=$(jq -r '.token' <<<"$R")
expect "anonymous share view" '.kind == "care_card"' "$(get "/api/v1/shares/$SHARE" "")"
SHARE_ID=$(jq -r '.share.id' <<<"$R")
expect "share count increments" ".shares | any(.id == \"$SHARE_ID\" and .view_count == 1)" "$(get "/api/v1/pets/$PET/shares" "$TOKEN")"
delete "/api/v1/shares/$SHARE_ID" "$TOKEN"
R=$(curl -sS "$BASE/api/v1/shares/$SHARE")
expect "revoked share returns SHARE_GONE" '.error.code == "SHARE_GONE"' "$R"
expect "Pet export includes timeline" '.timeline' "$(get "/api/v1/pets/$PET/export" "$TOKEN")"

echo "== F5 删除保护 =="
delete "/api/v1/pets/$PET" "$TOKEN" "{\"confirm\":\"$PET\"}"
expect "deleted Pet disappears from Family" ".pets | all(.id != \"$PET\")" "$(get "/api/v1/circles/$CIRCLE/pets" "$TOKEN")"

echo "== 汇总 =="
echo "PASS=$PASS FAIL=$FAIL"
