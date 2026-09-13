#!/usr/bin/env bash
# PLANET care coordination API acceptance.
#
# This verifies the server-side responsibility contract before testing push
# presentation on mobile runtimes. It deliberately creates fresh accounts and a
# fresh family on every run, so the printed request IDs can be paired with
# device screenshots/logs without relying on old state.
#
# Usage:
#   ./scripts/acceptance-care-coordination.sh [http://127.0.0.1:8081/api/v1]
#   DEV_AUTH_CODES=1 ./scripts/acceptance-care-coordination.sh
set -euo pipefail

BASE="${1:-${BASE:-http://127.0.0.1:8081/api/v1}}"
RUN="care-$(date +%s)-$$"
TODAY="$(TZ=Asia/Shanghai date +%Y-%m-%d)"
JSON_HEADER='Content-Type: application/json'

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "✓ $*"; }

request() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}" idem="${5:-}"
  local args=(-sS --max-time 20 -X "$method" "$BASE$path" -H "$JSON_HEADER")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  [ -n "$idem" ] && args+=(-H "Idempotency-Key: $idem")
  local output
  output=$(curl "${args[@]}" -w $'\n%{http_code}') || fail "request $method $path"
  STATUS="${output##*$'\n'}"
  BODY="${output%$'\n'*}"
}

json_field() {
  local expression="$1"
  printf '%s' "$BODY" | EXPR="$expression" python3 -c '
import json, os, sys
try:
    value = eval(os.environ["EXPR"], {}, {"d": json.load(sys.stdin)})
except Exception as exc:
    raise SystemExit(str(exc))
if value is None:
    print("")
else:
    print(value)
'
}

expect_status() {
  local expected="$1" label="$2"
  if [ "$STATUS" != "$expected" ]; then
    echo "$BODY" >&2
    fail "$label: HTTP $STATUS (expected $expected)"
  fi
  pass "$label"
}

expect_json() {
  local expression="$1" label="$2"
  if ! printf '%s' "$BODY" | EXPR="$expression" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
try:
    ok = bool(eval(os.environ["EXPR"], {}, {"d": d}))
except Exception:
    ok = False
sys.exit(0 if ok else 1)
'; then
    echo "$BODY" >&2
    fail "$label"
  fi
  pass "$label"
}

login() {
  local email="$1" code
  request POST /auth/request-code "" "{\"email\":\"$email\"}"
  expect_status 202 "request login code for $email"
  code="$(json_field 'd["dev_code"]')"
  [ -n "$code" ] || fail "development code missing; start API with DEV_AUTH_CODES=1"
  request POST /auth/verify-code "" "{\"email\":\"$email\",\"code\":\"$code\",\"device\":\"care-acceptance\"}"
  expect_status 200 "verify login code for $email"
  TOKEN="$(json_field 'd["token"]')"
  USER_ID="$(json_field 'd["user"]["id"]')"
}

echo "== PLANET care coordination acceptance =="
echo "API: $BASE"

curl -fsS "${BASE%/api/v1}/healthz" >/dev/null || fail "API is not reachable"

EMAIL_A="${RUN}-a@test.planet"
EMAIL_B="${RUN}-b@test.planet"
login "$EMAIL_A"; TOKEN_A="$TOKEN"; USER_A="$USER_ID"
login "$EMAIL_B"; TOKEN_B="$TOKEN"; USER_B="$USER_ID"

request POST /families "$TOKEN_A" '{"name":"照护协作验收家庭","timezone":"Asia/Shanghai"}' "$RUN-family"
expect_status 201 "create acceptance family"
FAMILY_ID="$(json_field 'd["family"]["id"]')"
request GET /families "$TOKEN_A"
expect_status 200 "read family list with member count"
expect_json "any(item.get('id') == '$FAMILY_ID' and item.get('member_count') == 1 for item in d['families'])" "new family reports one member"

request POST "/families/$FAMILY_ID/pets" "$TOKEN_A" '{"name":"Milo","species":"dog"}' "$RUN-pet"
expect_status 201 "create acceptance pet"
PET_ID="$(json_field 'd["pet"]["id"]')"

request POST "/families/$FAMILY_ID/pets" "$TOKEN_A" '{"name":"Nori","species":"cat"}' "$RUN-removable-pet"
expect_status 201 "create removable family pet"
REMOVABLE_PET_ID="$(json_field 'd["pet"]["id"]')"
request DELETE "/families/$FAMILY_ID/pets/$REMOVABLE_PET_ID" "$TOKEN_A" "" "$RUN-remove-family-pet"
expect_status 204 "family owner removes pet from this family"
request GET "/families/$FAMILY_ID/pets" "$TOKEN_A"
expect_status 200 "read family pets after removal"
expect_json "all(item.get('id') != '$REMOVABLE_PET_ID' for item in d['pets'])" "removed pet is no longer visible in the family"
request GET "/pets/$REMOVABLE_PET_ID" "$TOKEN_A"
expect_status 200 "pet asset remains after family removal"

request POST "/families/$FAMILY_ID/invite/refresh" "$TOKEN_A" "" "$RUN-invite-refresh"
expect_status 200 "refresh family invite"
INVITE="$(json_field 'd["invite_code"]')"
request POST /families/join "$TOKEN_B" "{\"code\":\"$INVITE\"}" "$RUN-family-join"
expect_status 200 "B joins family"
request GET /families "$TOKEN_A"
expect_status 200 "refresh family list after member joins"
expect_json "any(item.get('id') == '$FAMILY_ID' and item.get('member_count') == 2 for item in d['families'])" "family reports two members"

RISK_TIME="$(TZ=Asia/Shanghai date -v+20M +%H:%M)"
request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  "{\"type\":\"exercise\",\"title\":\"风险回流时区验收\",\"rule\":{\"type\":\"daily\",\"time\":\"$RISK_TIME\"}}" "$RUN-risk-plan"
expect_status 201 "create imminent risk item"
TASK_RISK="$(json_field 'd["task"]["id"]')"
PLAN_RISK="$(json_field 'd["task"]["care_plan_id"]')"

request POST "/families/$FAMILY_ID/care-occurrences/$TASK_RISK/claim" "$TOKEN_A" "" "$RUN-risk-claim"
expect_status 200 "A claims an unassigned care occurrence"
expect_json "d[\"claim\"][\"occurrence_id\"] == \"$TASK_RISK\" and d[\"claim\"][\"assigned_to_user_id\"] == \"$USER_A\"" "claim assigns this occurrence to A"
request POST "/families/$FAMILY_ID/care-occurrences/$TASK_RISK/claim" "$TOKEN_A" "" "$RUN-risk-claim"
expect_status 200 "replay occurrence claim"
expect_json "d[\"claim\"][\"assigned_to_user_id\"] == \"$USER_A\"" "claim replay remains authoritative"

request PATCH "/families/$FAMILY_ID/members/$USER_B" "$TOKEN_A" '{"role":"viewer"}' "$RUN-viewer-role"
expect_status 204 "switch B to view-only access"
request GET "/pets/$PET_ID/timeline" "$TOKEN_B"
expect_status 200 "view-only member can read the pet timeline"
request PUT "/care-plans/$PLAN_RISK/assignments/$USER_B" "$TOKEN_A" '{"role":"helper"}' "$RUN-viewer-assignment"
expect_status 404 "reject view-only member as care-plan helper"
expect_json 'd["error"]["code"] == "RESOURCE_NOT_FOUND"' "view-only assignment rejection is explicit"
request PATCH "/families/$FAMILY_ID/members/$USER_B" "$TOKEN_A" '{"role":"caregiver"}' "$RUN-caregiver-role"
expect_status 204 "restore B to participating access"
request PUT "/care-plans/$PLAN_RISK/assignments/$USER_B" "$TOKEN_A" '{"role":"helper"}' "$RUN-caregiver-assignment"
expect_status 200 "allow participating member as care-plan helper"
request PATCH "/families/$FAMILY_ID/members/$USER_B" "$TOKEN_A" '{"role":"viewer"}' "$RUN-viewer-role-cleanup"
expect_status 204 "switch assigned member to view-only access"
request GET "/care-plans/$PLAN_RISK/assignments" "$TOKEN_A"
expect_status 200 "read care-plan assignments after role change"
expect_json "all(item.get('user_id') != '$USER_B' or item.get('role') != 'helper' for item in d['assignments'])" "view-only role change removes helper assignment"
request PATCH "/families/$FAMILY_ID/members/$USER_B" "$TOKEN_A" '{"role":"caregiver"}' "$RUN-caregiver-role-final"
expect_status 204 "restore B to participating access after cleanup"

request POST "/care-occurrences/$TASK_RISK/requests" "$TOKEN_A" \
  "{\"family_id\":\"$FAMILY_ID\",\"target_user_id\":\"$USER_B\",\"message\":\"请确认你是否能做这项临近照护。\"}" "$RUN-risk-request"
expect_status 201 "send risk item to B"
request GET "/families/$FAMILY_ID/care-risks" "$TOKEN_A"
expect_status 200 "read care risks"
expect_json "any(item.get('occurrence_id') == '$TASK_RISK' and item.get('family_timezone') == 'Asia/Shanghai' and item.get('waiting_on_user') for item in d['risks'])" "risk projection carries family timezone"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"自定义窗口验收","rule":{"type":"daily","time":"21:00"}}' "$RUN-custom-window-plan"
expect_status 201 "create custom-window handoff item"
TASK_CUSTOM_WINDOW="$(json_field 'd["task"]["id"]')"

request POST "/families/$FAMILY_ID/care-handoff-batches" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"occurrence_ids\":[\"$TASK_CUSTOM_WINDOW\"],\"message\":\"窗口外事项不应被发送。\",\"starts_at\":\"${TODAY}T18:00:00+08:00\",\"ends_at\":\"${TODAY}T20:00:00+08:00\"}" "$RUN-custom-window-rejected"
expect_status 409 "reject occurrence outside custom handoff window"
expect_json 'd["error"]["code"] == "CARE_OCCURRENCE_OUTSIDE_HANDOFF_WINDOW"' "custom window rejection is explicit"

request POST "/families/$FAMILY_ID/care-handoff-batches" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"occurrence_ids\":[\"$TASK_CUSTOM_WINDOW\"],\"message\":\"今晚 20:00—22:00 交给你。\",\"starts_at\":\"${TODAY}T20:00:00+08:00\",\"ends_at\":\"${TODAY}T22:00:00+08:00\"}" "$RUN-custom-window-create"
expect_status 201 "create custom-window handoff"
CUSTOM_BATCH_ID="$(json_field 'd["batch"]["id"]')"
expect_json 'd["batch"]["starts_at"] != None and d["batch"]["ends_at"] != None' "custom handoff preserves its time window"

request POST "/care-handoff-batches/$CUSTOM_BATCH_ID/accept" "$TOKEN_B" '{}' "$RUN-custom-window-accept"
expect_status 200 "B accepts custom-window handoff"
expect_json 'd["batch"]["accepted_count"] == 1 and d["batch"]["open_count"] == 0' "custom-window handoff resolves one occurrence"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"晚饭后遛狗","rule":{"type":"daily","time":"18:00"}}' "$RUN-batch-plan-1"
expect_status 201 "create first shift handoff item"
TASK_BATCH_1="$(json_field 'd["task"]["id"]')"
request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"feeding","title":"晚饭喂食","rule":{"type":"daily","time":"19:00"}}' "$RUN-batch-plan-2"
expect_status 201 "create second shift handoff item"
TASK_BATCH_2="$(json_field 'd["task"]["id"]')"
request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"晚间补水","rule":{"type":"daily","time":"20:00"}}' "$RUN-batch-plan-3"
expect_status 201 "create third shift handoff item"
TASK_BATCH_3="$(json_field 'd["task"]["id"]')"

request POST "/families/$FAMILY_ID/care-handoff-batches" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"occurrence_ids\":[\"$TASK_BATCH_1\",\"$TASK_BATCH_2\",\"$TASK_BATCH_3\"],\"message\":\"我今晚加班，麻烦你来做。\"}" "$RUN-batch-create"
expect_status 201 "A sends one shift handoff for three occurrences"
BATCH_ID="$(json_field 'd["batch"]["id"]')"
expect_json 'd["batch"]["total_count"] == 3 and len(d["batch"]["requests"]) == 3' "batch contains three existing occurrences"
expect_json 'd["batch"]["family_timezone"] == "Asia/Shanghai" and all(item.get("family_timezone") == "Asia/Shanghai" for item in d["batch"]["requests"])' "handoff cards carry the family timezone"

request GET /care-handoff-batches/inbox "$TOKEN_B"
expect_status 200 "B sees one grouped shift handoff card"
expect_json 'len(d["batches"]) == 1 and d["batches"][0]["total_count"] == 3' "batch is not exposed as three inbox cards"

request POST "/care-handoff-batches/$BATCH_ID/accept" "$TOKEN_B" \
  "{\"occurrence_ids\":[\"$TASK_BATCH_1\",\"$TASK_BATCH_2\"]}" "$RUN-batch-accept-partial"
expect_status 200 "B accepts two selected shift items"
expect_json 'len([x for x in d["results"] if x["outcome"] == "changed"]) == 2 and len([x for x in d["results"] if x["outcome"] == "not_selected"]) == 1' "partial batch result is explicit"
expect_json 'd["batch"]["accepted_count"] == 2 and d["batch"]["open_count"] == 1' "partial batch preserves the unselected responsibility"

request POST "/care-handoff-batches/$BATCH_ID/accept" "$TOKEN_B" \
  "{\"occurrence_ids\":[\"$TASK_BATCH_1\",\"$TASK_BATCH_2\"]}" "$RUN-batch-accept-partial"
expect_status 200 "replay selected batch acceptance"
expect_json 'd["batch"]["accepted_count"] == 2' "replay does not claim the third item"

request POST "/care-handoff-batches/$BATCH_ID/accept" "$TOKEN_B" '{}' "$RUN-batch-accept-rest"
expect_status 200 "B accepts the remaining shift item"
expect_json 'd["batch"]["accepted_count"] == 3 and d["batch"]["open_count"] == 0' "all shift items are now assigned"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"继续转交遛狗","rule":{"type":"daily","time":"18:30"}}' "$RUN-batch-delegate-plan-1"
expect_status 201 "create first continued-handoff item"
TASK_BATCH_DELEGATE_1="$(json_field 'd["task"]["id"]')"
request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"feeding","title":"继续转交喂食","rule":{"type":"daily","time":"19:30"}}' "$RUN-batch-delegate-plan-2"
expect_status 201 "create second continued-handoff item"
TASK_BATCH_DELEGATE_2="$(json_field 'd["task"]["id"]')"

request POST "/families/$FAMILY_ID/care-handoff-batches" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"occurrence_ids\":[\"$TASK_BATCH_DELEGATE_1\",\"$TASK_BATCH_DELEGATE_2\"],\"message\":\"这段照护也麻烦你先来做。\"}" "$RUN-batch-delegate-create"
expect_status 201 "A sends a batch that can continue to another member"
BATCH_DELEGATE_ID="$(json_field 'd["batch"]["id"]')"

request POST "/care-handoff-batches/$BATCH_DELEGATE_ID/delegate" "$TOKEN_B" \
  "{\"target_user_id\":\"$USER_A\",\"occurrence_ids\":[\"$TASK_BATCH_DELEGATE_1\",\"$TASK_BATCH_DELEGATE_2\"],\"message\":\"我也有事，请你来做。\"}" "$RUN-batch-delegate-next"
expect_status 200 "B continues the grouped handoff to A"
BATCH_DELEGATE_NEXT_ID="$(json_field 'd["batch"]["id"]')"
expect_json 'len([x for x in d["results"] if x["outcome"] == "changed"]) == 2 and d["previous_batch"]["open_count"] == 0' "continued batch result closes the previous action card"
expect_json "d[\"batch\"][\"target_user_id\"] == \"$USER_A\" and d[\"batch\"][\"total_count\"] == 2" "continued batch targets the next caregiver"

request POST "/care-handoff-batches/$BATCH_DELEGATE_ID/delegate" "$TOKEN_B" \
  "{\"target_user_id\":\"$USER_A\",\"occurrence_ids\":[\"$TASK_BATCH_DELEGATE_1\",\"$TASK_BATCH_DELEGATE_2\"],\"message\":\"我也有事，请你来做。\"}" "$RUN-batch-delegate-next"
expect_status 200 "replay continued grouped handoff"
expect_json "d[\"batch\"][\"id\"] == \"$BATCH_DELEGATE_NEXT_ID\"" "continued handoff replay returns the same next card"

request POST "/care-handoff-batches/$BATCH_DELEGATE_NEXT_ID/accept" "$TOKEN_A" '{}' "$RUN-batch-delegate-accept"
expect_status 200 "A accepts the continued grouped handoff"
expect_json 'd["batch"]["accepted_count"] == 2 and d["batch"]["open_count"] == 0' "continued handoff assigns both items"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"拒绝后重排遛狗","rule":{"type":"daily","time":"20:30"}}' "$RUN-batch-reassign-plan"
expect_status 201 "create declined-batch continuation item"
TASK_BATCH_REASSIGN="$(json_field 'd["task"]["id"]')"
request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"feeding","title":"拒绝后重排喂食","rule":{"type":"daily","time":"21:30"}}' "$RUN-batch-reassign-plan-2"
expect_status 201 "create second declined-batch continuation item"
TASK_BATCH_REASSIGN_2="$(json_field 'd["task"]["id"]')"
request POST "/families/$FAMILY_ID/care-handoff-batches" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"occurrence_ids\":[\"$TASK_BATCH_REASSIGN\",\"$TASK_BATCH_REASSIGN_2\"],\"message\":\"如果不方便，请继续安排。\"}" "$RUN-batch-reassign-create"
expect_status 201 "A sends a batch that can be declined and reassigned"
BATCH_REASSIGN_ID="$(json_field 'd["batch"]["id"]')"
request POST "/care-handoff-batches/$BATCH_REASSIGN_ID/decline" "$TOKEN_B" \
  "{\"occurrence_ids\":[\"$TASK_BATCH_REASSIGN\"]}" "$RUN-batch-reassign-decline-one"
expect_status 200 "B declines one grouped handoff item"
expect_json 'len([x for x in d["results"] if x["outcome"] == "changed" and x["state"] == "declined"]) == 1 and d["batch"]["declined_count"] == 1 and d["batch"]["open_count"] == 1' "partial decline preserves the remaining open item"
request POST "/care-handoff-batches/$BATCH_REASSIGN_ID/decline" "$TOKEN_B" \
  "{\"occurrence_ids\":[\"$TASK_BATCH_REASSIGN_2\"]}" "$RUN-batch-reassign-decline-two"
expect_status 200 "B declines the remaining grouped handoff item"
expect_json 'd["batch"]["declined_count"] == 2 and d["batch"]["open_count"] == 0' "declined batch has no open responsibility"
request POST "/care-handoff-batches/$BATCH_REASSIGN_ID/reassign" "$TOKEN_B" \
  "{\"target_user_id\":\"$USER_A\",\"message\":\"我也不行，请你来做。\"}" "$RUN-batch-reassign-next"
expect_status 200 "B continues the declined batch to A"
BATCH_REASSIGN_NEXT_ID="$(json_field 'd["batch"]["id"]')"
expect_json "d[\"batch\"][\"target_user_id\"] == \"$USER_A\" and d[\"batch\"][\"total_count\"] == 2 and d[\"previous_batch\"][\"declined_count\"] == 2" "declined batch continues with preserved history"
request POST "/care-handoff-batches/$BATCH_REASSIGN_NEXT_ID/delegate" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"message\":\"请再确认一次。\"}" "$RUN-batch-reassign-loop"
expect_status 200 "batch responsibility rejects a declined member loop"
expect_json 'd.get("previous_batch") is None and len(d["results"]) == 2 and all(item["reason"] == "target_previously_declined" for item in d["results"])' "batch loop preserves the current responsibility"
request POST "/care-handoff-batches/$BATCH_REASSIGN_NEXT_ID/accept" "$TOKEN_A" '{}' "$RUN-batch-reassign-accept"
expect_status 200 "A accepts the reassigned grouped handoff"
expect_json 'd["batch"]["accepted_count"] == 2 and d["batch"]["open_count"] == 0' "reassigned batch is resolved"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"临时遛狗","rule":{"type":"daily","time":"08:00"}}' "$RUN-plan-accept"
expect_status 201 "create handoff completion care plan"
TASK_ACCEPT="$(json_field 'd["task"]["id"]')"
PLAN_ACCEPT="$(json_field 'd["task"]["care_plan_id"]')"

request POST "/care-occurrences/$TASK_ACCEPT/requests" "$TOKEN_A" \
  "{\"family_id\":\"$FAMILY_ID\",\"target_user_id\":\"$USER_B\",\"message\":\"我今天加班，麻烦晚上遛 Milo。\"}" "$RUN-request-accept"
expect_status 201 "A sends handoff request to B"
REQUEST_ACCEPT="$(json_field 'd["care_request"]["id"]')"
expect_json 'd["care_request"]["family_timezone"] == "Asia/Shanghai"' "care request carries the family timezone"
expect_json "d[\"care_request\"][\"care_plan_id\"] == \"$PLAN_ACCEPT\"" "care request carries its care plan"

request POST "/care-occurrences/$TASK_ACCEPT/requests" "$TOKEN_A" \
  "{\"family_id\":\"$FAMILY_ID\",\"target_user_id\":\"$USER_B\",\"message\":\"我今天加班，麻烦晚上遛 Milo。\"}" "$RUN-request-accept"
expect_status 201 "replay create request without creating another request"
expect_json "d[\"care_request\"][\"id\"] == \"$REQUEST_ACCEPT\"" "create replay returns same request"

request GET /care-requests/inbox "$TOKEN_B"
expect_status 200 "B sees incoming action card"
expect_json "any(item.get('id') == '$REQUEST_ACCEPT' for item in d['care_requests'])" "B inbox contains the request"

request POST "/care-requests/$REQUEST_ACCEPT/accept" "$TOKEN_B" '{"note":"我来做"}' "$RUN-accept"
expect_status 200 "B accepts request"
expect_json 'd["care_request"]["state"] == "accepted"' "request is accepted"

request POST "/care-requests/$REQUEST_ACCEPT/accept" "$TOKEN_B" '{"note":"我来做"}' "$RUN-accept"
expect_status 200 "replay accept without a second state transition"
expect_json 'd["care_request"]["state"] == "accepted"' "accept replay remains authoritative"

request POST "/tasks/$TASK_ACCEPT/logs" "$TOKEN_B" '{"status":"done"}' "$RUN-complete-accept"
expect_status 201 "temporary caregiver completes the accepted occurrence"
expect_json "d[\"log\"][\"done_by\"] == \"$USER_B\"" "completion records B as the executor"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"临时喂药（拒绝后转回）","rule":{"type":"daily","time":"09:00"}}' "$RUN-plan-reassign"
expect_status 201 "create decline and reassign care plan"
TASK_REASSIGN="$(json_field 'd["task"]["id"]')"

request POST "/care-occurrences/$TASK_REASSIGN/requests" "$TOKEN_A" \
  "{\"family_id\":\"$FAMILY_ID\",\"target_user_id\":\"$USER_B\",\"message\":\"如果你不方便，请继续转给我。\"}" "$RUN-request-reassign"
expect_status 201 "A sends second request to B"
REQUEST_DECLINED="$(json_field 'd["care_request"]["id"]')"

request POST "/care-requests/$REQUEST_DECLINED/decline" "$TOKEN_B" '{"note":"今晚不在家"}' "$RUN-decline"
expect_status 200 "B declines request"
expect_json 'd["care_request"]["state"] == "declined"' "decline is preserved as history"

request POST "/care-requests/$REQUEST_DECLINED/reassign" "$TOKEN_B" \
  "{\"target_user_id\":\"$USER_A\",\"message\":\"我不方便，请你来做。\"}" "$RUN-reassign"
expect_status 201 "B reassigns declined request to A"
REQUEST_REASSIGNED="$(json_field 'd["care_request"]["id"]')"
expect_json "d[\"care_request\"][\"state\"] == \"sent\" and d[\"care_request\"][\"supersedes_request_id\"] == \"$REQUEST_DECLINED\"" "reassigned request stays in the same occurrence chain"

request POST "/care-requests/$REQUEST_REASSIGNED/reassign" "$TOKEN_A" \
  "{\"target_user_id\":\"$USER_B\",\"message\":\"请再确认一次。\"}" "$RUN-reassign-loop"
expect_status 409 "responsibility chain rejects a declined member loop"

request POST "/care-requests/$REQUEST_REASSIGNED/accept" "$TOKEN_A" '{"note":"我来做"}' "$RUN-reassign-accept"
expect_status 200 "A accepts the reassigned request"
request GET "/care-requests/$REQUEST_REASSIGNED/chain" "$TOKEN_A"
expect_status 200 "A reads the responsibility chain"
expect_json 'len(d["care_requests"]) == 2 and d["care_requests"][0]["state"] == "declined" and d["care_requests"][1]["state"] == "accepted" and d["care_requests"][1]["supersedes_request_id"] == d["care_requests"][0]["id"]' "responsibility chain preserves decline and takeover order"
request POST "/tasks/$TASK_REASSIGN/logs" "$TOKEN_A" '{"status":"done"}' "$RUN-complete-reassign"
expect_status 201 "A completes after the decline and reassignment"

request POST "/pets/$PET_ID/care-plans" "$TOKEN_A" \
  '{"type":"exercise","title":"完成后收束请求","rule":{"type":"daily","time":"10:00"}}' "$RUN-plan-cancel"
expect_status 201 "create completion cancellation care plan"
TASK_CANCEL="$(json_field 'd["task"]["id"]')"

request POST "/care-occurrences/$TASK_CANCEL/requests" "$TOKEN_A" \
  "{\"family_id\":\"$FAMILY_ID\",\"target_user_id\":\"$USER_B\",\"message\":\"如果我没完成，再请你来做。\"}" "$RUN-request-cancel"
expect_status 201 "A sends request before completing directly"
REQUEST_CANCELLED="$(json_field 'd["care_request"]["id"]')"

request POST "/tasks/$TASK_CANCEL/logs" "$TOKEN_A" '{"status":"done"}' "$RUN-complete-cancel"
expect_status 201 "A completes and closes the open request"
request GET "/care-requests/$REQUEST_CANCELLED" "$TOKEN_A"
expect_status 200 "completed request remains readable as history"
expect_json 'd["care_request"]["state"] == "cancelled"' "open request is cancelled by completion"

request POST "/care-requests/$REQUEST_CANCELLED/accept" "$TOKEN_B" '{}' "$RUN-cancelled-accept"
expect_status 409 "B cannot accept a request after completion"
expect_json 'd["error"]["code"] == "CARE_REQUEST_NOT_ACTIONABLE"' "cancelled request has no action path"

echo
echo "PASS — server-side care coordination acceptance"
echo "family_id=$FAMILY_ID pet_id=$PET_ID"
echo "request_accept_id=$REQUEST_ACCEPT"
echo "care_handoff_batch_id=$BATCH_ID"
echo "request_declined_id=$REQUEST_DECLINED"
echo "request_reassigned_id=$REQUEST_REASSIGNED"
echo "request_cancelled_id=$REQUEST_CANCELLED"
echo "device follow-up: use request_accept_id for A→B notification action testing"
