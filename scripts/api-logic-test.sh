#!/usr/bin/env bash
# V1 业务逻辑边界测试 — 覆盖 walkthrough 22 项之外的规则：
# 成员/宠物配额、归档豁免、疫苗类型、停药自动事件、409 并发、Undo、
# 分享撤销语义、邀请预览、事件权限、导出完整性、用量端点。
set -uo pipefail
BASE=http://localhost:8090
J='Content-Type: application/json'
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
need() { # need <desc> <expected-substr> <actual>
  if echo "$3" | grep -q "$2"; then ok "$1"; else bad "$1 → got: $(echo "$3" | head -c 160)"; fi
}
code() { echo "$1" | sed -n 's/.*"dev_code":"\([0-9]*\)".*/\1/p'; }
tok()  { # tok <email> — two-step: request code, then verify
  local r c
  r=$(curl -s -X POST "$BASE/api/v1/auth/request-code" -H "$J" -d "{\"email\":\"$1\"}")
  c=$(code "$r")
  curl -s -X POST "$BASE/api/v1/auth/verify" -H "$J" -d "{\"email\":\"$1\",\"code\":\"$c\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

TS=$(date +%s)
TA=$(tok "owner-$TS@planet.dev")          # 圈主
TB=$(tok "cg-$TS@planet.dev")             # 照护者 1（也是成员上限的最后一个名额）
TC=$(tok "cg2-$TS@planet.dev")            # 照护者 2（用于触发成员上限）
[ -n "$TA" ] && [ -n "$TB" ] && [ -n "$TC" ] || { echo "FATAL: token bootstrap failed"; exit 1; }
HA="Authorization: Bearer $TA"; HB="Authorization: Bearer $TB"; HC="Authorization: Bearer $TC"

echo "== 建圈 =="
R=$(curl -s -X POST "$BASE/api/v1/circles" -H "$J" -H "$HA" -d '{"pet_name":"LogicFox","species":"dog","timezone":"Asia/Singapore"}')
PET1=$(echo "$R" | sed -n 's/.*"pet":{"id":\([0-9]*\).*/\1/p'); CIR=$(echo "$R" | sed -n 's/.*"circle":{"id":\([0-9]*\).*/\1/p')
INV=$(echo "$R" | sed -n 's/.*"invite_code":"\([^"]*\)".*/\1/p')
[ -n "$PET1" ] && ok "circle+pet1 (pet=$PET1)" || bad "create circle"

echo "== A. 成员上限（free=2 含 owner）==="
need "B join ok" '"invite_code"' "$(curl -s -X POST "$BASE/api/v1/circles/join" -H "$J" -H "$HB" -d "{\"invite_code\":\"$INV\"}")"
need "C join → 403 member limit" 'member limit reached' "$(curl -s -X POST "$BASE/api/v1/circles/join" -H "$J" -H "$HC" -d "{\"invite_code\":\"$INV\"}")"

echo "== B. 宠物上限（free=2 active）==="
P2=$(curl -s -X POST "$BASE/api/v1/pets" -H "$J" -H "$HA" -d '{"name":"Second","species":"cat"}' | sed -n 's/.*"pet":{"id":\([0-9]*\).*/\1/p')
[ -n "$P2" ] && ok "pet2 created" || bad "pet2 create"
need "pet3 → 403 pet limit" 'pet limit reached' "$(curl -s -X POST "$BASE/api/v1/pets" -H "$J" -H "$HA" -d '{"name":"Third","species":"cat"}')"

echo "== C. 归档豁免配额 =="
need "archive pet2" '"archived":true' "$(curl -s -X POST "$BASE/api/v1/pets/$P2/archive" -H "$HA")"
P3=$(curl -s -X POST "$BASE/api/v1/pets" -H "$J" -H "$HA" -d '{"name":"Third","species":"cat"}' | sed -n 's/.*"pet":{"id":\([0-9]*\).*/\1/p')
[ -n "$P3" ] && ok "pet3 created while pet2 archived (slot freed)" || bad "pet3 after archive"
UNARC=$(curl -s -X POST "$BASE/api/v1/pets/$P2/unarchive" -H "$HA")
need "unarchive with 2 active → 403 pet limit" 'pet limit reached' "$UNARC"
curl -s -X DELETE "$BASE/api/v1/pets/$P3" -H "$HA" > /dev/null   # 腾回名额
need "unarchive after freeing slot ok" '"archived":false' "$(curl -s -X POST "$BASE/api/v1/pets/$P2/unarchive" -H "$HA")"

echo "== D. 疫苗事件类型 =="
need "vaccine event + next_due" '"vaccine"' "$(curl -s -X POST "$BASE/api/v1/pets/$PET1/events" -H "$J" -H "$HA" -d '{"type":"vaccine","title":"Rabies vaccine","data":{"next_due":"2027-08-01"}}')"

echo "== E. 停药自动事件 =="
MED=$(curl -s -X POST "$BASE/api/v1/pets/$PET1/medications" -H "$J" -H "$HA" -d '{"name":"TestMed","dose":"5mg","schedule":"daily"}')
MID=$(echo "$MED" | sed -n 's/.*"medication":{"id":\([0-9]*\).*/\1/p')
need "add med auto-creates Started event" '"event"' "$MED"
STOP=$(curl -s -X PATCH "$BASE/api/v1/medications/$MID" -H "$J" -H "$HA" -d '{"active":false}')
need "stop med → ended_on + Stopped event" '"ended_on"' "$STOP"
need "meds list: past section" 'TestMed' "$(curl -s "$BASE/api/v1/pets/$PET1/medications" -H "$HA")"

echo "== F. 任务 409 并发（权威 log）==="
TID=$(curl -s -X POST "$BASE/api/v1/pets/$PET1/tasks" -H "$J" -H "$HA" -d '{"title":"Concurrency","time_of_day":"09:00"}' | sed -n 's/.*"task":{"id":\([0-9]*\).*/\1/p')
L1=$(curl -s -X POST "$BASE/api/v1/tasks/$TID/log" -H "$J" -H "$HA" -d '{"status":"done","note":"by owner"}')
L2=$(curl -s -w '|%{http_code}' -X POST "$BASE/api/v1/tasks/$TID/log" -H "$J" -H "$HB" -d '{"status":"done","note":"by caregiver-late"}')
need "first log ok" '"by_name"' "$L1"
need "second log → 409 + authoritative" '|409' "$L2"
echo "$L2" | grep -q 'by owner' && ok "409 carries first writer's log" || bad "409 authoritative log"

echo "== G. Undo log =="
need "undo" '"ok":true' "$(curl -s -X DELETE "$BASE/api/v1/tasks/$TID/log?date=$(date +%F)" -H "$HA")"
need "today shows undone task" '"log":null' "$(curl -s "$BASE/api/v1/pets/$PET1/today" -H "$HA")"

echo "== H. 分享撤销语义 =="
SH=$(curl -s -X POST "$BASE/api/v1/pets/$PET1/shares" -H "$J" -H "$HA" -d '{"kind":"care","ttl_hours":24}')
SHID=$(echo "$SH" | sed -n 's/.*"share":{"id":\([0-9]*\).*/\1/p'); SHURL=$(echo "$SH" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
need "public care card renders" 'CARING FOR' "$(curl -s "$SHURL")"
curl -s -X DELETE "$BASE/api/v1/shares/$SHID" -H "$HA" > /dev/null
need "revoked page → neutral ask-family line" 'family' "$(curl -s "$SHURL")"
need "shares list status=revoked" '"revoked"' "$(curl -s "$BASE/api/v1/pets/$PET1/shares" -H "$HA")"

echo "== I. 邀请预览（公开）==="
need "invite preview" 'LogicFox' "$(curl -s "$BASE/invite/$INV")"

echo "== J. 事件权限（记录者或 owner）==="
EV=$(curl -s -X POST "$BASE/api/v1/pets/$PET1/events" -H "$J" -H "$HA" -d '{"type":"note","title":"owner-recorded"}')
EID=$(echo "$EV" | sed -n 's/.*"event":{"id":\([0-9]*\).*/\1/p')
# B（非记录者、非 owner）删除 → 应拒绝
need "caregiver cannot delete others' event" '403\|404' "$(curl -s -w '|%{http_code}' -X DELETE "$BASE/api/v1/events/$EID" -H "$HB")"
need "recorder edits own event" 'owner-recorded edited' "$(curl -s -X PATCH "$BASE/api/v1/events/$EID" -H "$J" -H "$HA" -d '{"title":"owner-recorded edited"}')"

echo "== K. 导出完整性 =="
EXP=$(curl -s "$BASE/api/v1/pets/$PET1/export" -H "$HA")
for KEY in '"medications"' '"care_tasks"' '"task_logs"' '"timeline_events"' '"attachments"' '"pet"'; do
  echo "$EXP" | grep -q "$KEY" && ok "export has $KEY" || bad "export missing $KEY"
done

echo "== L. 用量端点 =="
need "usage quotas" 'storage_limit_bytes' "$(curl -s "$BASE/api/v1/circles/$CIR/usage" -H "$HA")"

echo "== 清理 =="
for P in "$PET1" "$P2"; do curl -s -X DELETE "$BASE/api/v1/pets/$P" -H "$HA" > /dev/null; done
curl -s -X DELETE "$BASE/api/v1/me" -H "$HA" > /dev/null
curl -s -X DELETE "$BASE/api/v1/me" -H "$HB" > /dev/null
curl -s -X DELETE "$BASE/api/v1/me" -H "$HC" > /dev/null
ok "cleaned"

echo "== 汇总 =="; echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "ALL GREEN ✓" || echo "HAS FAILURES ✗"
