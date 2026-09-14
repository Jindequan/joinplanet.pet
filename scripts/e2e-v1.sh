#!/bin/bash
# e2e-v1.sh — PLANET V1 dual-account (A/B + C) end-to-end verification
# against the live local API (default http://localhost:8081, DEV_AUTH_CODES=1).
#
# Routes/payloads verified against planet-api/internal/modules/*/http.go.
# Idempotent: unique email/family suffix per run (timestamp + PID).
# Prints "PASS/FAIL <step>" per check, a final summary, and exits nonzero on any FAIL.
#
# NOTE on rate limits: the local DEV_AUTH_CODES posture uses generous
# process-local buckets so repeated development runs remain possible. The
# production posture and strict integration test still enforce the documented
# IP/email limits; this script uses fresh addresses on every run.
set -u

BASE="${BASE:-http://localhost:8081}"
J='Content-Type: application/json'
TS=$(date +%s)
UNIQ="${TS}-$$"

PASS=0
FAIL=0
FAILED=()

pass() { PASS=$((PASS + 1)); printf 'PASS %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); FAILED+=("$1"); printf 'FAIL %s -- %s\n' "$1" "${2:-}"; }

headc() { printf '%s' "$1" | cut -c1-400; }

# ---------------------------------------------------------------------------
# HTTP helper: req METHOD PATH [BEARER_TOKEN] [JSON_BODY]
#   sets STATUS (http code) and BODY (response body)
# ---------------------------------------------------------------------------
req() {
  local m=$1 p=$2 tok=${3:-} body=${4:-} idem=${5:-}
  local args=(-s -X "$m" "$BASE$p" -H "$J" --max-time 20)
  if [ -n "$tok" ]; then args+=(-H "Authorization: Bearer $tok"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  local out
  if { [ "$m" = "POST" ] || [ -n "$idem" ]; } && [[ "$p" != /api/v1/auth/* ]]; then
    [ -n "$idem" ] || idem="e2e-${UNIQ}-${RANDOM}-${PASS}-${FAIL}"
    args+=(-H "Idempotency-Key: $idem")
  fi
  out=$(curl "${args[@]}" -w $'\n%{http_code}')
  STATUS=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

# expect LABEL EXPECTED_STATUS [PYTHON_EXPR over dict d]
#   PYTHON_EXPR is evaluated with the response body parsed as JSON in `d`.
expect() {
  local label=$1 want=$2 expr=${3:-}
  if [ "$STATUS" != "$want" ]; then
    fail "$label" "HTTP $STATUS (want $want); body: $(headc "$BODY")"
    return 1
  fi
  if [ -n "$expr" ] && [ -n "$BODY" ]; then
    if ! printf '%s' "$BODY" | EXPR="$expr" python3 -c '
import json, sys, os
d = json.load(sys.stdin)
ok = eval(os.environ["EXPR"])
sys.exit(0 if ok else 1)
' 2>/dev/null; then
      fail "$label" "HTTP $STATUS ok, assertion failed: $expr; body: $(headc "$BODY")"
      return 1
    fi
  fi
  pass "$label"
  return 0
}

# jget PYTHON_EXPR — print value extracted from last BODY (dict `d`)
jget() {
  printf '%s' "$BODY" | EXPR="$1" python3 -c '
import json, sys, os
d = json.load(sys.stdin)
print(eval(os.environ["EXPR"]))
'
}

# login EMAIL — sets TOK (bearer token) and UID (user id)
login() {
  local email=$1 code
  req POST /api/v1/auth/request-code "" "{\"email\":\"$email\"}"
  if [ "$STATUS" != "202" ]; then
    echo "FATAL: request-code for $email -> HTTP $STATUS: $(headc "$BODY")"
    exit 2
  fi
  code=$(jget 'd["dev_code"]')
  req POST /api/v1/auth/verify-code "" "{\"email\":\"$email\",\"code\":\"$code\"}"
  if [ "$STATUS" != "200" ]; then
    echo "FATAL: verify-code for $email -> HTTP $STATUS: $(headc "$BODY")"
    exit 2
  fi
  TOK=$(jget 'd["token"]')
  USER_ID=$(jget 'd["user"]["id"]')
}

# ---------------------------------------------------------------------------
echo "== PLANET V1 E2E ($BASE, run $UNIQ) =="

req GET /healthz
if [ "$STATUS" != "200" ]; then
  echo "FATAL: server not healthy at $BASE/healthz (HTTP $STATUS)"
  exit 2
fi

# "Today" in the families' timezone (Asia/Shanghai is the server default).
TODAY=$(python3 -c '
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
    print(datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat())
except Exception:
    print((datetime.now(timezone.utc) + timedelta(hours=8)).date().isoformat())
')

# Timestamps for timeline events: strictly increasing, in the past.
EV=()
i=0
while [ $i -le 7 ]; do
  EV[$i]=$(python3 -c "from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)-timedelta(minutes=$((90-i)))).isoformat())")
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
echo "-- Bootstrap accounts (A, B, C) --"
A_EMAIL="e2e-a-$UNIQ@planet.test"
B_EMAIL="e2e-b-$UNIQ@planet.test"
C_EMAIL="e2e-c-$UNIQ@planet.test"
login "$A_EMAIL"; A_TOK=$TOK; A_ID=$USER_ID
login "$B_EMAIL"; B_TOK=$TOK; B_ID=$USER_ID
login "$C_EMAIL"; C_TOK=$TOK; C_ID=$USER_ID
pass "auth: 3 accounts logged in via dev_code (A=$A_ID B=$B_ID C=$C_ID)"

# ===========================================================================
echo "== Scenario 1: A bootstrap — me / family / pet / today =="
req GET /api/v1/me "$A_TOK"
expect "1.1a A GET /me" 200 'd["user"]["email"] == "'"$A_EMAIL"'"'
A_NAME_BEFORE=$(jget 'd["user"]["display_name"]')

req GET /api/v1/families "$A_TOK"
expect "1.1b A has no families yet" 200 'd["families"] == []'

req POST /api/v1/families "$A_TOK" "{\"name\":\"Family A $UNIQ\",\"timezone\":\"Asia/Shanghai\"}"
expect "1.2a A creates family" 201 'd["family"]["role"] == "owner" and len(d["invite_code"]) >= 6'
CIRCLE_A=$(jget 'd["family"]["id"]')
CIRCLE_A_NAME="Family A $UNIQ"

req GET "/api/v1/families/$CIRCLE_A/audit-records" "$A_TOK"
expect "1.2b family audit records the creation" 200 'any(r["action"] == "family_created" for r in d["records"])'

req POST "/api/v1/families/$CIRCLE_A/pets" "$A_TOK" '{"name":"Mochi","species":"cat"}'
expect "1.3a A creates pet Mochi" 201 'd["pet"]["name"] == "Mochi" and d["pet"]["species"] == "cat"'
PET_ID=$(jget 'd["pet"]["id"]')

req GET "/api/v1/families/$CIRCLE_A/audit-records" "$A_TOK"
expect "1.3b family audit records pet creation" 200 'any(r["action"] == "pet_created" and r["resource_id"] == "'"$PET_ID"'" for r in d["records"])'

req GET "/api/v1/families/$CIRCLE_A/today?date=$TODAY" "$A_TOK"
expect "1.4a A today view empty" 200 'd["date"] == "'"$TODAY"'" and d["pets"] == []'

req GET "/api/v1/pets/$PET_ID" "$A_TOK"
PET_VERSION=$(jget 'd["pet"]["version"]')
RECORD_UPDATE_KEY="e2e-record-update-$UNIQ"
RECORD_UPDATE_BODY="{\"version\":$PET_VERSION,\"name\":\"Mochi\",\"species\":\"cat\",\"notes\":\"Needs a quiet meal.\",\"allergies\":[],\"conditions\":[],\"emergency_contacts\":[],\"med_decision_maker\":{}}"
req PATCH "/api/v1/pets/$PET_ID/record" "$A_TOK" "$RECORD_UPDATE_BODY" "$RECORD_UPDATE_KEY"
expect "1.5a atomic Pet record update" 200 'd["pet"]["name"] == "Mochi" and d["profile"]["notes"] == "Needs a quiet meal."'
req PATCH "/api/v1/pets/$PET_ID/record" "$A_TOK" "$RECORD_UPDATE_BODY" "$RECORD_UPDATE_KEY"
expect "1.5b retry returns the same Pet record (idempotent)" 200 'd["pet"]["name"] == "Mochi" and d["profile"]["notes"] == "Needs a quiet meal."'
RECORD_UPDATE_CONFLICT_BODY="{\"version\":$PET_VERSION,\"name\":\"Mochi\",\"species\":\"cat\",\"notes\":\"different request\",\"allergies\":[],\"conditions\":[],\"emergency_contacts\":[],\"med_decision_maker\":{}}"
req PATCH "/api/v1/pets/$PET_ID/record" "$A_TOK" "$RECORD_UPDATE_CONFLICT_BODY" "$RECORD_UPDATE_KEY"
expect "1.5c same key with different record is rejected" 409 'd["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"'

# ===========================================================================
echo "== Scenario 2: task lifecycle — done / 409 / undo / skipped =="
req POST "/api/v1/pets/$PET_ID/tasks" "$A_TOK" '{"title":"Feed dinner","time_of_day":"18:30","schedule":{"v":1,"kind":"daily"}}'
expect "2.1a A creates daily task" 201 'd["task"]["title"] == "Feed dinner" and d["task"]["time_of_day"] == "18:30"'
TASK1=$(jget 'd["task"]["id"]')

req GET "/api/v1/families/$CIRCLE_A/audit-records" "$A_TOK"
expect "2.1b family audit records care-plan creation" 200 'any(r["action"] == "care_plan_created" and r["metadata"].get("title") == "Feed dinner" for r in d["records"])'

req POST "/api/v1/tasks/$TASK1/logs" "$A_TOK" '{"status":"done"}'
expect "2.2a A logs task done (server returns 201)" 201 'd["log"]["status"] in ("done", "completed")'
LOG1=$(jget 'd["log"]["id"]')

req POST "/api/v1/tasks/$TASK1/logs" "$A_TOK" '{"status":"done"}'
expect "2.3a duplicate log -> 409 TASK_LOG_EXISTS + authoritative log" 409 'd["error"]["code"] == "TASK_LOG_EXISTS" and d["log"]["id"] == "'"$LOG1"'" and d["log"]["status"] in ("done", "completed")'

req POST "/api/v1/task-logs/$LOG1/undo" "$A_TOK"
expect "2.4a undo log -> 204" 204

req POST "/api/v1/tasks/$TASK1/logs" "$A_TOK" '{"status":"skipped"}'
expect "2.5a re-log as skipped" 201 'd["log"]["status"] == "skipped"'

req GET "/api/v1/families/$CIRCLE_A/today?date=$TODAY" "$A_TOK"
expect "2.6a today shows skipped" 200 'any(it["task"]["id"] == "'"$TASK1"'" and it["log"] is not None and it["log"]["status"] == "skipped" for g in d["pets"] for it in g["items"])'

req POST "/api/v1/pets/$PET_ID/tasks" "$A_TOK" '{"title":"Morning walk","time_of_day":"08:00","schedule":{"v":1,"kind":"daily"}}'
expect "2.7a A creates a second shared task" 201 'd["task"]["title"] == "Morning walk"'
TASK2=$(jget 'd["task"]["id"]')

# ===========================================================================
echo "== Scenario 3: timeline — event types, photo, newest-first, redundancy, PATCH/DELETE =="
req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"note\",\"occurred_at\":\"${EV[0]}\",\"payload\":{\"text\":\"First note $UNIQ\"}}"
expect "3.1a note event" 201 'd["event"]["type"] == "note" and d["event"]["source"] == "user"'
EV_NOTE=$(jget 'd["event"]["id"]')

req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"symptom\",\"occurred_at\":\"${EV[1]}\",\"payload\":{\"title\":\"Sneezing\",\"detail\":\"mild\"}}"
expect "3.2a symptom event" 201 'd["event"]["type"] == "symptom"'
EV_SYMPTOM=$(jget 'd["event"]["id"]')

req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"weight\",\"occurred_at\":\"${EV[2]}\",\"payload\":{\"weight_g\":5200}}"
expect "3.3a weight event 5200g" 201 'd["event"]["payload"]["weight_g"] == 5200'
EV_WEIGHT=$(jget 'd["event"]["id"]')

req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"vet_visit\",\"occurred_at\":\"${EV[3]}\",\"payload\":{\"title\":\"Annual check\",\"next_due\":\"2027-02-01\"}}"
expect "3.4a vet_visit event with next_due" 201 'd["event"]["type"] == "vet_visit"'
EV_VET=$(jget 'd["event"]["id"]')

req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"vaccine\",\"occurred_at\":\"${EV[4]}\",\"payload\":{\"name\":\"Rabies\",\"next_due\":\"2027-01-15\"}}"
expect "3.5a vaccine event with next_due" 201 'd["event"]["payload"]["name"] == "Rabies"'
EV_VACCINE=$(jget 'd["event"]["id"]')

PHOTO_DATA='data:image/jpeg;base64,ZmFrZS1waG90bw=='
req POST "/api/v1/pets/$PET_ID/timeline" "$A_TOK" "{\"type\":\"photo\",\"occurred_at\":\"${EV[6]}\",\"payload\":{\"photo_data\":\"$PHOTO_DATA\",\"caption\":\"At the park\"}}"
expect "3.5b photo event with caption" 201 'd["event"]["type"] == "photo" and d["event"]["payload"]["photo_data"] == "'"$PHOTO_DATA"'"'
EV_PHOTO=$(jget 'd["event"]["id"]')

req GET "/api/v1/pets/$PET_ID/timeline" "$A_TOK"
expect "3.6a timeline returns 6 user events newest-first" 200 'len([e for e in d["events"] if e["id"] in ("'"$EV_PHOTO"'", "'"$EV_VACCINE"'", "'"$EV_VET"'", "'"$EV_WEIGHT"'", "'"$EV_SYMPTOM"'", "'"$EV_NOTE"'")]) == 6 and [e["type"] for e in d["events"] if e["id"] in ("'"$EV_PHOTO"'", "'"$EV_VACCINE"'", "'"$EV_VET"'", "'"$EV_WEIGHT"'", "'"$EV_SYMPTOM"'", "'"$EV_NOTE"'")] == ["photo","vaccine","vet_visit","weight","symptom","note"]'

req GET "/api/v1/pets/$PET_ID" "$A_TOK"
expect "3.7a pet weight_g == 5200 (redundancy rebuilt)" 200 'd["pet"]["weight_g"] == 5200'

req PATCH "/api/v1/timeline-events/$EV_NOTE" "$A_TOK" "{\"occurred_at\":\"${EV[0]}\",\"payload\":{\"text\":\"Edited note $UNIQ\"}}"
expect "3.8a PATCH note payload -> 200" 200 'd["event"]["payload"]["text"] == "Edited note '"$UNIQ"'" and d["event"].get("edited_at") is not None'

req DELETE "/api/v1/timeline-events/$EV_VACCINE" "$A_TOK"
expect "3.9a DELETE vaccine event -> 204" 204

req GET "/api/v1/pets/$PET_ID/timeline" "$A_TOK"
expect "3.9b timeline has 5 user events, vaccine gone" 200 'len([e for e in d["events"] if e["id"] in ("'"$EV_PHOTO"'", "'"$EV_VET"'", "'"$EV_WEIGHT"'", "'"$EV_SYMPTOM"'", "'"$EV_NOTE"'")]) == 5 and not any(e["type"] == "vaccine" for e in d["events"] if e["id"] in ("'"$EV_PHOTO"'", "'"$EV_VET"'", "'"$EV_WEIGHT"'", "'"$EV_SYMPTOM"'", "'"$EV_NOTE"'"))'

# ===========================================================================
echo "== Scenario 4: medications — auto timeline event + stop =="
req POST "/api/v1/pets/$PET_ID/medications" "$A_TOK" '{"name":"Amitraz","dose":"half tablet","schedule":"daily after dinner","note":"with food"}'
expect "4.1a A adds medication" 201 'd["medication"]["name"] == "Amitraz" and d["medication"].get("ended_on") is None'
MED_ID=$(jget 'd["medication"]["id"]')

req GET "/api/v1/pets/$PET_ID/timeline" "$A_TOK"
expect "4.2a auto medication event (type=medication, source=auto:med, action=started)" 200 'any(e["type"] == "medication" and e["source"] == "auto:med" and e["payload"]["action"] == "started" and e["payload"]["medication_id"] == "'"$MED_ID"'" for e in d["events"])'

req POST "/api/v1/medications/$MED_ID/stop" "$A_TOK"
expect "4.3a stop medication -> ended_on set" 200 'd["medication"]["ended_on"] is not None'

req GET "/api/v1/pets/$PET_ID/timeline" "$A_TOK"
expect "4.4a auto medication ended event recorded" 200 'any(e["type"] == "medication" and e["source"] == "auto:med" and e["payload"]["action"] == "ended" for e in d["events"])'

# ===========================================================================
echo "== Scenario 5: invite + join + shared today + B completes A's task =="
req POST "/api/v1/families/$CIRCLE_A/invite/refresh" "$A_TOK"
expect "5.1a A refreshes invite code" 200 'len(d["invite_code"]) >= 6'
INVITE_A=$(jget 'd["invite_code"]')

req POST /api/v1/families/join "$B_TOK" "{\"code\":\"$INVITE_A\"}"
expect "5.2a B joins via code" 200 'd["family"]["id"] == "'"$CIRCLE_A"'" and d["family"]["role"] == "caregiver"'

req GET "/api/v1/families/$CIRCLE_A" "$A_TOK"
expect "5.3a B appears in members as caregiver" 200 'any(m["user_id"] == "'"$B_ID"'" and m["role"] == "caregiver" for m in d["members"])'

req GET "/api/v1/families/$CIRCLE_A/today?date=$TODAY" "$B_TOK"
expect "5.4a B token can read today" 200 'd["date"] == "'"$TODAY"'"'

req PUT "/api/v1/care-plans/$TASK2/assignments/$B_ID" "$A_TOK" '{"role":"helper"}'
expect "5.4b A assigns the shared task to B" 200 'd["assignment"]["user_id"] == "'"$B_ID"'"'

req GET "/api/v1/families/$CIRCLE_A/audit-records" "$A_TOK"
expect "5.4c family audit records assignment change" 200 'any(r["action"] == "care_assignment_added" and r["metadata"].get("title") == "Morning walk" and r["metadata"].get("target_user_id") == "'"$B_ID"'" for r in d["records"])'

req POST "/api/v1/tasks/$TASK2/logs" "$B_TOK" '{"status":"done"}'
expect "5.5a B completes the assigned A-family task" 201 'd["log"]["status"] in ("done", "completed") and d["log"]["done_by"] == "'"$B_ID"'"'

req GET "/api/v1/families/$CIRCLE_A/today?date=$TODAY" "$B_TOK"
expect "5.5b today (B token) shows B's completed log" 200 'any(it["task"]["id"] == "'"$TASK2"'" and it["log"] is not None and it["log"]["status"] in ("done", "completed") and it["log"]["done_by"] == "'"$B_ID"'" for g in d["pets"] for it in g["items"])'

# ===========================================================================
echo "== Scenario 6: shares — care_card, anonymous view, revoke -> 410 =="
req POST "/api/v1/pets/$PET_ID/shares" "$A_TOK" '{"kind":"care_card","ttl_hours":24}'
expect "6.1a A creates care_card share #1" 201 'd["share"]["kind"] == "care_card" and len(d["token"]) >= 20'
SHARE1_ID=$(jget 'd["share"]["id"]')
SHARE1_TOKEN=$(jget 'd["token"]')

req POST "/api/v1/pets/$PET_ID/shares" "$A_TOK" '{"kind":"care_card","ttl_hours":24}'
expect "6.1b A creates care_card share #2 (kept for transfer revocation test)" 201 'd["share"]["kind"] == "care_card"'
SHARE2_TOKEN=$(jget 'd["token"]')

req GET "/api/v1/shares/$SHARE1_TOKEN" ""
expect "6.2a anonymous GET share (no auth) -> 200, no allergy/history fields" 200 'd["kind"] == "care_card" and d["data"]["pet"]["name"] == "Mochi" and "allergies" not in d["data"] and "conditions" not in d["data"] and "events" not in d["data"] and "allergies" not in d'

req POST "/api/v1/pets/$PET_ID/shares" "$A_TOK" '{"kind":"summary","ttl_hours":24,"options":{"days":90}}'
expect "6.2b A creates photo-free summary by default" 201 'd["share"]["kind"] == "summary"'
SUMMARY_NO_PHOTO_TOKEN=$(jget 'd["token"]')
req GET "/api/v1/shares/$SUMMARY_NO_PHOTO_TOKEN" ""
expect "6.2c summary omits photos unless selected" 200 'd["kind"] == "summary" and all("photo_data" not in e.get("payload", {}) for e in d["data"].get("events", []))'

req POST "/api/v1/pets/$PET_ID/shares" "$A_TOK" '{"kind":"summary","ttl_hours":24,"options":{"days":90,"include_photos":true}}'
expect "6.2d A explicitly includes summary photos" 201 'd["share"]["kind"] == "summary"'
SUMMARY_WITH_PHOTO_TOKEN=$(jget 'd["token"]')
req GET "/api/v1/shares/$SUMMARY_WITH_PHOTO_TOKEN" ""
expect "6.2e selected summary includes photo" 200 'any(e.get("payload", {}).get("photo_data") == "'"$PHOTO_DATA"'" for e in d["data"].get("events", []))'

req DELETE "/api/v1/shares/$SHARE1_ID" "$A_TOK"
expect "6.3a A revokes share #1 -> 204" 204

req GET "/api/v1/shares/$SHARE1_TOKEN" ""
expect "6.4a revoked share token -> 410 SHARE_GONE" 410 'd["error"]["code"] == "SHARE_GONE"'

# ===========================================================================
echo "== Scenario 7: pet transfer A-family -> B-family =="
req POST /api/v1/families "$B_TOK" "{\"name\":\"Family B $UNIQ\",\"timezone\":\"Asia/Shanghai\"}"
expect "7.1a B creates own family" 201 'd["family"]["role"] == "owner"'
CIRCLE_B=$(jget 'd["family"]["id"]')
CIRCLE_B_NAME="Family B Renamed $UNIQ"

TRANSFER_CREATE_KEY="e2e-transfer-create-$UNIQ"
req POST "/api/v1/pets/$PET_ID/transfer" "$A_TOK" "{\"to_family_id\":\"$CIRCLE_B\"}" "$TRANSFER_CREATE_KEY"
expect "7.2a A (source owner) initiates transfer" 201 'd["transfer"]["status"] == "pending" and d["transfer"]["to_family_id"] == "'"$CIRCLE_B"'"'
TRANSFER_ID=$(jget 'd["transfer"]["id"]')

req POST "/api/v1/pets/$PET_ID/transfer" "$A_TOK" "{\"to_family_id\":\"$CIRCLE_B\"}" "$TRANSFER_CREATE_KEY"
expect "7.2b retry returns the same transfer (idempotent)" 201 'd["transfer"]["id"] == "'"$TRANSFER_ID"'"'

req GET "/api/v1/families/$CIRCLE_B/transfers?direction=incoming" "$B_TOK"
expect "7.3a B sees incoming pending transfer" 200 'any(t["id"] == "'"$TRANSFER_ID"'" and t["status"] == "pending" for t in d["transfers"])'

TRANSFER_ACCEPT_KEY="e2e-transfer-accept-$UNIQ"
req POST "/api/v1/transfers/$TRANSFER_ID/accept" "$B_TOK" "" "$TRANSFER_ACCEPT_KEY"
expect "7.4a B accepts transfer" 200 'd["transfer"]["status"] == "accepted"'

req POST "/api/v1/transfers/$TRANSFER_ID/accept" "$B_TOK" "" "$TRANSFER_ACCEPT_KEY"
expect "7.4b retry returns the accepted transfer (idempotent)" 200 'd["transfer"]["id"] == "'"$TRANSFER_ID"'" and d["transfer"]["status"] == "accepted"'

req GET "/api/v1/families/$CIRCLE_B/pets" "$B_TOK"
expect "7.5a pet now in B's family" 200 'any(p["id"] == "'"$PET_ID"'" for p in d["pets"])'

req GET "/api/v1/families/$CIRCLE_A/pets" "$A_TOK"
expect "7.5b old Family no longer has live Pet visibility" 200 'not any(p["id"] == "'"$PET_ID"'" for p in d["pets"])'

req GET "/api/v1/shares/$SHARE2_TOKEN" ""
expect "7.6a share #2 auto-revoked by transfer -> 410 SHARE_GONE" 410 'd["error"]["code"] == "SHARE_GONE"'

# ===========================================================================
echo "== Scenario 8: governance — rename, leave, ownership transfer, delete/restore =="
req PATCH "/api/v1/families/$CIRCLE_B" "$B_TOK" "{\"name\":\"Family B Renamed $UNIQ\"}"
expect "8.1a B renames own family (PATCH exists)" 200 'd["family"]["name"] == "Family B Renamed '"$UNIQ"'"'

req POST "/api/v1/families/$CIRCLE_A/leave" "$B_TOK"
expect "8.2a B leaves A's family -> 204" 204

req GET "/api/v1/families/$CIRCLE_A" "$A_TOK"
expect "8.2b B gone from A's family members" 200 'not any(m["user_id"] == "'"$B_ID"'" for m in d["members"])'

req POST "/api/v1/families/$CIRCLE_B/invite/refresh" "$B_TOK"
expect "8.3a B refreshes own family invite" 200 'len(d["invite_code"]) >= 6'
INVITE_B=$(jget 'd["invite_code"]')

req POST /api/v1/families/join "$A_TOK" "{\"code\":\"$INVITE_B\"}"
expect "8.3b A joins B's family" 200 'd["family"]["id"] == "'"$CIRCLE_B"'"'

FAMILY_TRANSFER_KEY="e2e-family-transfer-$UNIQ"
req POST "/api/v1/families/$CIRCLE_B/transfer" "$B_TOK" "{\"to_user_id\":\"$A_ID\"}" "$FAMILY_TRANSFER_KEY"
expect "8.3c B transfers family ownership to A" 200 'any(m["user_id"] == "'"$A_ID"'" and m["role"] == "owner" for m in d["members"]) and any(m["user_id"] == "'"$B_ID"'" and m["role"] == "caregiver" for m in d["members"])'

req POST "/api/v1/families/$CIRCLE_B/transfer" "$B_TOK" "{\"to_user_id\":\"$A_ID\"}" "$FAMILY_TRANSFER_KEY"
expect "8.3c2 retry returns the final Family ownership state (idempotent)" 200 'any(m["user_id"] == "'"$A_ID"'" and m["role"] == "owner" for m in d["members"]) and any(m["user_id"] == "'"$B_ID"'" and m["role"] == "caregiver" for m in d["members"])'

req POST "/api/v1/families/$CIRCLE_B/leave" "$B_TOK"
expect "8.3c3 B leaves after transferring Family ownership" 204

req GET "/api/v1/families/$CIRCLE_A/pets" "$A_TOK"
expect "8.3d source Family remains empty after B leaves" 200 'not any(p["id"] == "'"$PET_ID"'" for p in d["pets"])'

req DELETE "/api/v1/families/$CIRCLE_A" "$A_TOK" "{\"confirm\":\"$CIRCLE_A_NAME\"}"
expect "8.3e A deletes the now-empty old Family" 204

req DELETE "/api/v1/families/$CIRCLE_B" "$A_TOK" "{\"confirm\":\"$CIRCLE_B_NAME\"}"
expect "8.4a delete family with pet present -> 409 FAMILY_NOT_EMPTY" 409 'd["error"]["code"] == "FAMILY_NOT_EMPTY"'

req DELETE "/api/v1/pets/$PET_ID" "$B_TOK" "{\"confirm\":\"$PET_ID\"}"
expect "8.5a current Pet owner deletes pet (confirm=pet id) -> 204" 204

req DELETE "/api/v1/families/$CIRCLE_B" "$A_TOK" "{\"confirm\":\"$CIRCLE_B_NAME\"}"
expect "8.6a A deletes now-empty family -> 204" 204

req POST "/api/v1/families/$CIRCLE_B/restore" "$A_TOK"
expect "8.7a 30-day restore route exists -> 200" 200 'd["family"]["id"] == "'"$CIRCLE_B"'"'

# ===========================================================================
echo "== Scenario 9: negative paths — isolation, quota, archived, malformed =="
req GET "/api/v1/families/$CIRCLE_A/today?date=$TODAY" "$C_TOK"
expect "9.1a C reads A's today -> 404" 404 'd["error"]["code"] == "RESOURCE_NOT_FOUND"'

req POST "/api/v1/families/$CIRCLE_A/pets" "$C_TOK" '{"name":"Intruder","species":"dog"}'
expect "9.2a C creates pet in A's family -> 404" 404 'd["error"]["code"] == "RESOURCE_NOT_FOUND"'

req POST /api/v1/families "$C_TOK" "{\"name\":\"Family C $UNIQ\",\"timezone\":\"Asia/Shanghai\"}"
expect "9.3a C creates fresh family" 201 'True'
CIRCLE_C=$(jget 'd["family"]["id"]')

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetOne","species":"dog"}'
expect "9.3b C pet 1 created" 201 'True'
PET_C1=$(jget 'd["pet"]["id"]')

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetTwo","species":"dog"}'
expect "9.3c C pet 2 created" 201 'True'
PET_C2=$(jget 'd["pet"]["id"]')

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetThree","species":"dog"}'
expect "9.3d C pet 3 created" 201 'True'

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetFour","species":"dog"}'
expect "9.3e C pet 4 created" 201 'True'

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetFive","species":"dog"}'
expect "9.3f C pet 5 created" 201 'True'

req POST "/api/v1/families/$CIRCLE_C/pets" "$C_TOK" '{"name":"PetSix","species":"dog"}'
expect "9.3g C pet 6 -> 403 QUOTA_PETS_EXCEEDED (free pet_max=5)" 403 'd["error"]["code"] == "QUOTA_PETS_EXCEEDED" and d["usage"]["pet_max"] == 5'

req POST "/api/v1/pets/$PET_C1/archive" "$C_TOK"
expect "9.4a C archives pet 1" 200 'd["pet"].get("archived_at") is not None'

req POST "/api/v1/pets/$PET_C1/timeline" "$C_TOK" "{\"type\":\"note\",\"occurred_at\":\"${EV[5]}\",\"payload\":{\"text\":\"should fail\"}}"
expect "9.4b timeline event on archived pet -> 409 PET_ARCHIVED" 409 'd["error"]["code"] == "PET_ARCHIVED"'

req POST "/api/v1/pets/$PET_C1/shares" "$C_TOK" '{"kind":"care_card","ttl_hours":24}'
expect "9.4c share of archived pet -> 409 PET_ARCHIVED" 409 'd["error"]["code"] == "PET_ARCHIVED"'

req POST "/api/v1/pets/$PET_C2/timeline" "$C_TOK" '{"type":"note","occurred_at":"not-a-date","payload":{"text":"bad date"}}'
expect "9.5a malformed occurred_at -> 400 VALIDATION_FAILED" 400 'd["error"]["code"] == "VALIDATION_FAILED"'

req GET /api/v1/care-requests/not-a-real-request "$C_TOK"
expect "9.5b malformed care request deep link -> 400 VALIDATION_FAILED" 400 'd["error"]["code"] == "VALIDATION_FAILED"'

req GET /api/v1/care-handoff-batches/not-a-real-batch "$C_TOK"
expect "9.5c malformed handoff deep link -> 400 VALIDATION_FAILED" 400 'd["error"]["code"] == "VALIDATION_FAILED"'

MISSING_ID="00000000-0000-0000-0000-000000000000"
req GET "/api/v1/care-requests/$MISSING_ID" "$C_TOK"
expect "9.5d stale care request deep link -> 404 RESOURCE_NOT_FOUND" 404 'd["error"]["code"] == "RESOURCE_NOT_FOUND"'

req GET "/api/v1/care-handoff-batches/$MISSING_ID" "$C_TOK"
expect "9.5e stale handoff deep link -> 404 RESOURCE_NOT_FOUND" 404 'd["error"]["code"] == "RESOURCE_NOT_FOUND"'

req POST /api/v1/care-occurrences/not-a-real-occurrence/requests "$C_TOK" "{\"family_id\":\"$CIRCLE_C\",\"target_user_id\":\"$A_ID\"}"
expect "9.5f malformed care action id -> 400 VALIDATION_FAILED" 400 'd["error"]["code"] == "VALIDATION_FAILED"'

req POST /api/v1/care-handoff-batches/not-a-real-batch/accept "$C_TOK" '{}'
expect "9.5g malformed batch action id -> 400 VALIDATION_FAILED" 400 'd["error"]["code"] == "VALIDATION_FAILED"'

# ===========================================================================
echo "== Scenario 10: account lifecycle — profile update + logout invalidation =="
req PATCH /api/v1/me "$A_TOK" "{\"display_name\":\"Alice $UNIQ\"}"
expect "10.1a A updates display_name" 200 'd["user"]["display_name"] == "Alice '"$UNIQ"'"'

req DELETE /api/v1/auth/session "$A_TOK"
expect "10.2a A deletes session -> 204" 204

req GET /api/v1/me "$A_TOK"
expect "10.3a old token rejected -> 401 UNAUTHENTICATED" 401 'd["error"]["code"] == "UNAUTHENTICATED"'

# ---------------------------------------------------------------------------
echo
echo "================ SUMMARY ================"
echo "PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed steps:"
  for s in "${FAILED[@]}"; do echo "  - $s"; done
  exit 1
fi
echo "All checks passed."
exit 0
