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
  local path="$1" token="$2" body="${3:-}" idempotency="${4:-}"
  local args=(-sS -X DELETE "$BASE$path" -H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "$JSON" -d "$body")
  [ -n "$idempotency" ] && args+=(-H "Idempotency-Key: $idempotency")
  curl "${args[@]}"
}

EMAIL="walkthrough.$(date +%s)@planet.dev"
EMAIL_B="walkthrough.b.$(date +%s)@planet.dev"
EMAIL_C="walkthrough.c.$(date +%s)@planet.dev"
DISPLAY_B="${EMAIL_B%@*}"

echo "== F1 认证与会话 =="
R=$(post /api/v1/auth/request-code "" "{\"email\":\"$EMAIL\"}")
expect "request-code returns development code" '.sent == true and (.dev_code | strings | test("^[0-9]{6}$"))' "$R"
CODE=$(jq -r '.dev_code' <<<"$R")
R=$(post /api/v1/auth/verify-code "" "{\"email\":\"$EMAIL\",\"code\":\"$CODE\",\"device\":\"api-walkthrough\"}")
expect "verify-code returns session" '.token | strings | length > 20' "$R"
TOKEN=$(jq -r '.token' <<<"$R")
USER_A=$(jq -r '.user.id' <<<"$R")
expect "authenticated /me returns the same email" ".user.email == \"$EMAIL\"" "$(get /api/v1/me "$TOKEN")"

echo "== F2 Family、成员、Pet =="
R=$(post /api/v1/families "$TOKEN" '{"name":"Walkthrough Family","timezone":"Asia/Shanghai"}' "$(key)")
expect "create Family" '.family.id and .invite_code' "$R"
CIRCLE=$(jq -r '.family.id' <<<"$R")
INVITE=$(jq -r '.invite_code' <<<"$R")
expect "Family keeps its IANA timezone" '.family.timezone == "Asia/Shanghai"' "$R"
R=$(post "/api/v1/families/$CIRCLE/pets" "$TOKEN" '{"name":"Milo","species":"dog","breed":"Golden Retriever"}' "$(key)")
expect "create Pet" '.pet.id and .pet.name == "Milo"' "$R"
PET=$(jq -r '.pet.id' <<<"$R")
expect "canonical accessible Pet list includes the owner Pet" ".pets | any(.id == \"$PET\")" "$(get /api/v1/pets "$TOKEN")"
R=$(post /api/v1/auth/request-code "" "{\"email\":\"$EMAIL_C\"}")
CODE_C=$(jq -r '.dev_code' <<<"$R")
R=$(post /api/v1/auth/verify-code "" "{\"email\":\"$EMAIL_C\",\"code\":\"$CODE_C\"}")
TOKEN_C=$(jq -r '.token' <<<"$R")
USER_C=$(jq -r '.user.id' <<<"$(get /api/v1/me "$TOKEN_C")")
R=$(post "/api/v1/pets/$PET/access-grants" "$TOKEN" "{\"user_id\":\"$USER_C\",\"role\":\"editor\"}" "$(key)")
GRANT=$(jq -r '.grant.id' <<<"$R")
expect "directly granted user sees the Pet" ".pets | any(.id == \"$PET\" and .access_role == \"editor\")" "$(get /api/v1/pets "$TOKEN_C")"
R=$(post /api/v1/auth/request-code "" "{\"email\":\"$EMAIL_B\"}")
CODE_B=$(jq -r '.dev_code' <<<"$R")
R=$(post /api/v1/auth/verify-code "" "{\"email\":\"$EMAIL_B\",\"code\":\"$CODE_B\"}")
TOKEN_B=$(jq -r '.token' <<<"$R")
USER_B=$(jq -r '.user.id' <<<"$R")
R=$(post /api/v1/families/join "$TOKEN_B" "{\"code\":\"$INVITE\"}" "$(key)")
expect "second user joins Family" ".family.id == \"$CIRCLE\"" "$R"
expect "second user sees the shared Pet" ".pets | any(.id == \"$PET\")" "$(get "/api/v1/families/$CIRCLE/pets" "$TOKEN_B")"
ROLE_VIEWER_KEY="$(key)"
change_role() {
  local role="$1" key_value="$2"
  curl -sS -X PATCH "$BASE/api/v1/families/$CIRCLE/members/$USER_B" -H "$JSON" -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $key_value" -d "{\"role\":\"$role\"}"
}
change_role viewer "$ROLE_VIEWER_KEY" >/dev/null
R=$(change_role viewer "$ROLE_VIEWER_KEY")
[ -z "$R" ] && ok "repeating member role change with the same key is safe" || fail "repeating member role change with the same key"
ROLE_CAREGIVER_KEY="$(key)"
change_role caregiver "$ROLE_CAREGIVER_KEY" >/dev/null
R=$(post /api/v1/families "$TOKEN_B" '{"name":"Second Walkthrough Family","timezone":"Asia/Shanghai"}' "$(key)")
expect "create second Family for Pet sharing" '.family.id and .invite_code' "$R"
CIRCLE_2=$(jq -r '.family.id' <<<"$R")
INVITE_2=$(jq -r '.invite_code' <<<"$R")
R=$(post /api/v1/families/join "$TOKEN" "{\"code\":\"$INVITE_2\"}" "$(key)")
expect "Pet owner joins the second Family" ".family.id == \"$CIRCLE_2\"" "$R"
R=$(post "/api/v1/pets/$PET/families" "$TOKEN" "{\"family_id\":\"$CIRCLE_2\"}" "$(key)")
expect "share Pet with another Family" ".family_id == \"$CIRCLE_2\"" "$R"
# 跨家庭共享走确认制（founder 裁决 2026-09-17）：目标家庭 owner 接受后
# ACL 边才存在，宠物才会出现在目标家庭列表。
R=$(get "/api/v1/families/$CIRCLE_2/pet-share-requests?direction=incoming" "$TOKEN_B")
expect "share request waits for confirmation" ".share_requests | any(.pet_id == \"$PET\" and .state == \"pending\")" "$R"
SHARE_REQUEST=$(jq -r ".share_requests[] | select(.pet_id == \"$PET\" and .state == \"pending\") | .id" <<<"$R" | head -n1)
R=$(post "/api/v1/pet-share-requests/$SHARE_REQUEST/accept" "$TOKEN_B" '{}' "$(key)")
expect "target owner accepts share request" '.share_request.state == "accepted"' "$R"
expect "shared Family sees the Pet" ".pets | any(.id == \"$PET\")" "$(get "/api/v1/families/$CIRCLE_2/pets" "$TOKEN_B")"
REMOVE_MEMBER_KEY="$(key)"
delete "/api/v1/families/$CIRCLE_2/members/$USER_A" "$TOKEN_B" '' "$REMOVE_MEMBER_KEY"
R=$(delete "/api/v1/families/$CIRCLE_2/members/$USER_A" "$TOKEN_B" '' "$REMOVE_MEMBER_KEY")
[ -z "$R" ] && ok "repeating member removal with the same key is safe" || fail "repeating member removal with the same key"
expect "removed member leaves shared Family" ".members | all(.user_id != \"$USER_A\")" "$(get "/api/v1/families/$CIRCLE_2" "$TOKEN_B")"
UNSHARE_KEY="$(key)"
delete "/api/v1/pets/$PET/families/$CIRCLE_2" "$TOKEN" '' "$UNSHARE_KEY"
R=$(delete "/api/v1/pets/$PET/families/$CIRCLE_2" "$TOKEN" '' "$UNSHARE_KEY")
[ -z "$R" ] && ok "repeating shared Family removal with the same key is safe" || fail "repeating shared Family removal with the same key"
expect "remove shared Family access" ".pets | all(.id != \"$PET\")" "$(get "/api/v1/families/$CIRCLE_2/pets" "$TOKEN_B")"

echo "== F3 Care plan、Today、历史 =="
R=$(post "/api/v1/pets/$PET/care-plans" "$TOKEN" '{"type":"medication","title":"Heart medicine","description":"With food","rule":{"type":"daily","time":"08:00"}}' "$(key)")
expect "create care plan" '.care_plan.id and .care_rule.id and .task.id' "$R"
TASK=$(jq -r '.task.id' <<<"$R")
CARE_ITEM=$(jq -r '.care_plan.id' <<<"$R")
R=$(curl -sS -X PUT "$BASE/api/v1/care-plans/$CARE_ITEM/assignments/$USER_B" -H "$JSON" -H "Authorization: Bearer $TOKEN" -d '{"role":"helper"}')
expect "assign a helper to the care plan" ".assignment.user_id == \"$USER_B\" and .assignment.role == \"helper\"" "$R"
expect "care assignments list includes the helper" ".assignments | any(.user_id == \"$USER_B\" and .role == \"helper\")" "$(get "/api/v1/care-plans/$CARE_ITEM/assignments" "$TOKEN")"
R=$(curl -sS -X PUT "$BASE/api/v1/care-plans/$CARE_ITEM/assignments/$USER_A" -H "$JSON" -H "Authorization: Bearer $TOKEN_B" -d '{"role":"helper"}')
expect "non-owner cannot change care assignments" '.error.code == "ROLE_FORBIDDEN"' "$R"
REMOVE_ASSIGNMENT_KEY="$(key)"
delete "/api/v1/care-plans/$CARE_ITEM/assignments/$USER_B" "$TOKEN" '' "$REMOVE_ASSIGNMENT_KEY"
R=$(delete "/api/v1/care-plans/$CARE_ITEM/assignments/$USER_B" "$TOKEN" '' "$REMOVE_ASSIGNMENT_KEY")
[ -z "$R" ] && ok "repeating assignment removal with the same key is safe" || fail "repeating assignment removal with the same key"
expect "remove helper from the care plan" ".assignments | all(.user_id != \"$USER_B\")" "$(get "/api/v1/care-plans/$CARE_ITEM/assignments" "$TOKEN")"
R=$(curl -sS -w $'\n%{http_code}' -X DELETE "$BASE/api/v1/care-plans/$CARE_ITEM/assignments/$USER_A" -H "Authorization: Bearer $TOKEN")
OWNER_DELETE_STATUS="${R##*$'\n'}"
OWNER_DELETE_BODY="${R%$'\n'*}"
[ "$OWNER_DELETE_STATUS" = "409" ] && expect "care plan cannot lose its owner" '.error.code == "CARE_ASSIGNMENT_OWNER_REQUIRED"' "$OWNER_DELETE_BODY" || fail "care plan cannot lose its owner"
expect "care plan owner assignment remains intact" ".assignments | any(.user_id == \"$USER_A\" and .role == \"owner\")" "$(get "/api/v1/care-plans/$CARE_ITEM/assignments" "$TOKEN")"
# 清缴批（founder 2026-09-26 裁决 A）已删 PATCH /api/v1/tasks/{id} 孤儿端点：
# 归档/恢复的现行契约是 PATCH /api/v1/care-plans/{id}（响应 care_plan 键）。
R=$(curl -sS -X PATCH "$BASE/api/v1/care-plans/$CARE_ITEM" -H "$JSON" -H "Authorization: Bearer $TOKEN" -d '{"archived":true}')
expect "archive care plan" ".care_plan.archived_at != null" "$R"
expect "archived care plan is discoverable when requested" ".care_plans | any(.id == \"$CARE_ITEM\" and .archived_at != null)" "$(get "/api/v1/pets/$PET/care-plans?include_archived=true" "$TOKEN")"
R=$(curl -sS -X PATCH "$BASE/api/v1/care-plans/$CARE_ITEM" -H "$JSON" -H "Authorization: Bearer $TOKEN" -d '{"status":"active"}')
expect "restore care plan" ".care_plan.archived_at == null" "$R"
# 清缴批已删 GET /families/{id}/today 孤儿端点：现行契约 GET /today?family_id=。
TODAY=$(get "/api/v1/today?family_id=$CIRCLE" "$TOKEN")
expect "Today contains the care task" ".pets[].items[] | select(.task.care_plan_id == \"$CARE_ITEM\")" "$TODAY"
TASK=$(jq -r '.pets[].items[] | select(.task.care_plan_id == "'"$CARE_ITEM"'") | .task.id' <<<"$TODAY")
expect "directly granted user sees Pet Today" ".pets[].items[] | select(.task.care_plan_id == \"$CARE_ITEM\")" "$(get "/api/v1/today?pet_id=$PET" "$TOKEN_C")"
R=$(post "/api/v1/care-tasks/$TASK/complete" "$TOKEN" '{"status":"done"}' "$(key)")
expect "complete Today task" '.log.status == "completed" or .log.status == "done"' "$R"
LOG=$(jq -r '.log.id' <<<"$R")
R=$(post "/api/v1/task-logs/$LOG/undo" "$TOKEN" '' "$(key)")
[ -z "$R" ] && ok "undo task completion" || expect "undo task completion" 'true' "$R"
R=$(post "/api/v1/care-tasks/$TASK/complete" "$TOKEN" '{"status":"skipped"}' "$(key)")
expect "skip Today task" '.log.status == "skipped"' "$R"
SKIP_LOG=$(jq -r '.log.id' <<<"$R")
R=$(post "/api/v1/task-logs/$SKIP_LOG/undo" "$TOKEN" '' "$(key)")
[ -z "$R" ] && ok "undo skipped task" || expect "undo skipped task" 'true' "$R"
R=$(post "/api/v1/pets/$PET/timeline" "$TOKEN" '{"type":"symptom","occurred_at":"2026-08-21T08:00:00Z","payload":{"text":"Less active after breakfast"}}' "$(key)")
expect "record timeline symptom" '.event.type == "symptom"' "$R"
expect "timeline returns the record" '.events | any(.type == "symptom")' "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
R=$(post "/api/v1/pets/$PET/timeline" "$TOKEN_B" '{"type":"note","occurred_at":"2026-08-21T09:00:00Z","payload":{"text":"B checked the morning walk"}}' "$(key)")
expect "second caregiver can record a note" ".event.recorded_by_name == \"$DISPLAY_B\"" "$R"
expect "timeline keeps the real recorder name" ".events | any(.recorded_by_name == \"$DISPLAY_B\" and .payload.text == \"B checked the morning walk\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
# GET /families/{id}/alerts 已删（清缴批 founder 2026-09-26 裁决 A，L5 孤儿
# 端点——告警现在走推送链路，无 HTTP 读面）；digest 读端点保留。
expect "daily digest returns the Family view" '.date and (.pets | type == "array")' "$(get "/api/v1/families/$CIRCLE/digest" "$TOKEN")"

echo "== F3b 用药生命周期 =="
R=$(post "/api/v1/pets/$PET/medications" "$TOKEN" '{"name":"Heartgard","dose":"1 tablet","schedule":"monthly","note":"with food"}' "$(key)")
expect "start medication" '.medication.id and .medication.ended_on == null' "$R"
MED=$(jq -r '.medication.id' <<<"$R")
expect "started medication appears in the Pet list" ".medications | any(.id == \"$MED\" and .ended_on == null)" "$(get "/api/v1/pets/$PET/medications" "$TOKEN")"
expect "medication start is recorded automatically" ".events | any(.type == \"medication\" and .source == \"auto:med\" and .payload.action == \"started\" and .payload.medication_id == \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
STOP_KEY="$(key)"
R=$(post "/api/v1/medications/$MED/stop" "$TOKEN" '' "$STOP_KEY")
expect "stop medication" ".medication.id == \"$MED\" and (.medication.ended_on | strings | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}$\"))" "$R"
R=$(post "/api/v1/medications/$MED/stop" "$TOKEN" '' "$STOP_KEY")
expect "repeating stop is idempotent" ".medication.id == \"$MED\" and (.medication.ended_on | strings | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}\"))" "$R"
expect "medication stop is recorded automatically" ".events | any(.type == \"medication\" and .source == \"auto:med\" and .payload.action == \"ended\" and .payload.medication_id == \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"
DELETE_MED_KEY="$(key)"
delete "/api/v1/medications/$MED" "$TOKEN" '' "$DELETE_MED_KEY"
R=$(delete "/api/v1/medications/$MED" "$TOKEN" '' "$DELETE_MED_KEY")
[ -z "$R" ] && ok "repeating medication delete with the same key is safe" || fail "repeating medication delete with the same key"
expect "deleted medication removes its automatic history" ".events | all(.payload.medication_id != \"$MED\")" "$(get "/api/v1/pets/$PET/timeline" "$TOKEN")"

echo "== F4 分享、撤销、导出 =="
R=$(post "/api/v1/pets/$PET/shares" "$TOKEN" '{"kind":"care_card","ttl_hours":24}' "$(key)")
expect "create care card share" '.share.id and .token' "$R"
SHARE=$(jq -r '.token' <<<"$R")
expect "anonymous share view" '.kind == "care_card"' "$(get "/api/v1/shares/$SHARE" "")"
SHARE_ID=$(jq -r '.share.id' <<<"$R")
expect "share count increments" ".shares | any(.id == \"$SHARE_ID\" and .view_count == 1)" "$(get "/api/v1/pets/$PET/shares" "$TOKEN")"
REVOKE_KEY="$(key)"
delete "/api/v1/shares/$SHARE_ID" "$TOKEN" '' "$REVOKE_KEY"
R=$(delete "/api/v1/shares/$SHARE_ID" "$TOKEN" '' "$REVOKE_KEY")
[ -z "$R" ] && ok "repeating share revoke with the same key is safe" || fail "repeating share revoke with the same key"
R=$(curl -sS "$BASE/api/v1/shares/$SHARE")
expect "revoked share returns SHARE_GONE" '.error.code == "SHARE_GONE"' "$R"
expect "Pet export includes timeline" '.timeline' "$(get "/api/v1/pets/$PET/export" "$TOKEN")"
REVOKE_ACCESS_KEY="$(key)"
delete "/api/v1/pets/$PET/access-grants/$GRANT" "$TOKEN" '' "$REVOKE_ACCESS_KEY"
R=$(delete "/api/v1/pets/$PET/access-grants/$GRANT" "$TOKEN" '' "$REVOKE_ACCESS_KEY")
[ -z "$R" ] && ok "repeating access revoke with the same key is safe" || fail "repeating access revoke with the same key"
expect "revoking direct access removes the Pet" ".pets | all(.id != \"$PET\")" "$(get /api/v1/pets "$TOKEN_C")"

echo "== F5 删除保护 =="
delete "/api/v1/pets/$PET" "$TOKEN" "{\"confirm\":\"$PET\"}"
expect "deleted Pet disappears from Family" ".pets | all(.id != \"$PET\")" "$(get "/api/v1/families/$CIRCLE/pets" "$TOKEN")"

echo "== 清理测试账号 =="
# 注销受 ACCOUNT_FAMILY_HAS_MEMBERS 守卫约束（owner 名下家庭不得有其他在册
# 成员）：B 已在 F2 段把 A 移出 CIRCLE_2，故按 C→B→A 注销（B 先于 owner，
# CIRCLE 才能成员清空）；每笔注销断言 204，不再吞响应（守卫 409 曾被
# >/dev/null 掩盖，本场景自守卫上线起静默变红）。
for pair in "$TOKEN_C:$EMAIL_C" "$TOKEN_B:$EMAIL_B" "$TOKEN:$EMAIL"; do
  old_token="${pair%%:*}"; old_email="${pair##*:}"
  status=$(curl -sS -w '%{http_code}' -o /dev/null -X DELETE "$BASE/api/v1/account" -H "Authorization: Bearer $old_token" -H "$JSON" -d "{\"confirm\":\"$old_email\"}")
  [ "$status" = 204 ] || fail "account deletion ($old_email) got $status"
done
for pair in "$TOKEN:$EMAIL" "$TOKEN_B:$EMAIL_B" "$TOKEN_C:$EMAIL_C"; do
  old_token="${pair%%:*}"
  status=$(curl -sS -w '%{http_code}' -o /dev/null "$BASE/api/v1/me" -H "Authorization: Bearer $old_token")
  [ "$status" = 401 ] || fail "deleted account token is rejected"
done
ok "test accounts are deleted and old tokens return 401"

echo "== 汇总 =="
echo "PASS=$PASS FAIL=$FAIL"
