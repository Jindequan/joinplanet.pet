#!/usr/bin/env bash
# PLANET API 全链路走查（I5 验收用）—— 对 docs/product/API-CONTRACT.md 逐条验证。
# 用法：BASE=http://localhost:8080 bash scripts/api-walkthrough.sh
set -euo pipefail
BASE="${BASE:-http://localhost:8080}"
EMAIL="demo$(date +%s)@planet.dev"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
need() { # need <desc> <expected-substr> <actual>
  if echo "$3" | grep -q "$2"; then ok "$1"; else bad "$1 → got: $(echo "$3" | head -c 200)"; fi
}
J='Content-Type: application/json'

echo "== F1 认证 =="
R=$(curl -s -X POST "$BASE/api/v1/auth/request-code" -H "$J" -d "{\"email\":\"$EMAIL\"}")
need "request-code returns dev_code" '"dev_code"' "$R"
CODE=$(echo "$R" | sed -n 's/.*"dev_code":"\([0-9]*\)".*/\1/p')
R=$(curl -s -X POST "$BASE/api/v1/auth/verify" -H "$J" -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}")
need "verify returns token" '"token"' "$R"
TOKEN=$(echo "$R" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"
R=$(curl -s "$BASE/api/v1/me" -H "$A")
need "me (no circles yet)" '"email"' "$R"

echo "== F2 建圈（含第一只宠物） =="
R=$(curl -s -X POST "$BASE/api/v1/circles" -H "$J" -H "$A" -d '{"pet_name":"Milo","species":"dog","breed":"Golden Retriever","timezone":"Asia/Singapore"}')
need "create circle+pet" '"invite_code"' "$R"
PET=$(echo "$R" | sed -n 's/.*"pet":{"id":\([0-9]*\).*/\1/p')
CIRCLE=$(echo "$R" | sed -n 's/.*"circle":{"id":\([0-9]*\).*/\1/p')
[ -n "$PET" ] && ok "petID=$PET" || bad "pet id parse"

echo "== F3 档案与用药 =="
R=$(curl -s -X PATCH "$BASE/api/v1/pets/$PET" -H "$J" -H "$A" -d '{"allergies":["Chicken (severe)"],"conditions":["Atopic dermatitis"],"emergency_contacts":{"primary":{"name":"Devin","phone":"+65 9000 0001"},"vet":{"name":"Greenwoods Veterinary","phone":"+65 6000 0002"},"authorized_decision_maker":{"name":"Li Ping","phone":"+65 8000 0003"}}}')
need "patch pet profile" 'Atopic' "$R"
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/medications" -H "$J" -H "$A" -d '{"name":"Apoquel","dose":"16mg","schedule":"Once daily"}')
need "create medication + auto timeline event" '"event"' "$R"
MED=$(echo "$R" | sed -n 's/.*"medication":{"id":\([0-9]*\).*/\1/p')

echo "== F4 今日照护 =="
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/tasks" -H "$J" -H "$A" -d '{"title":"Breakfast","time_of_day":"08:00"}')
need "create task" '"task"' "$R"
TASK=$(echo "$R" | sed -n 's/.*"task":{"id":\([0-9]*\).*/\1/p')
R=$(curl -s "$BASE/api/v1/pets/$PET/today" -H "$A")
need "today list" 'Breakfast' "$R"
R=$(curl -s -X POST "$BASE/api/v1/tasks/$TASK/log" -H "$J" -H "$A" -d '{"status":"done"}')
need "complete task" '"status":"done"' "$R"
R=$(curl -s -X DELETE "$BASE/api/v1/tasks/$TASK/log" -H "$A")
need "undo log" '"ok"' "$R"

echo "== F5 时间线 =="
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/events" -H "$J" -H "$A" -d '{"type":"symptom","title":"Vomited twice after dinner","severity":"moderate"}')
need "create symptom event" '"symptom"' "$R"
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/events" -H "$J" -H "$A" -d '{"type":"weight","title":"5.9 kg","data":{"weight_kg":5.9}}')
need "create weight event" 'weight_kg' "$R"
R=$(curl -s "$BASE/api/v1/pets/$PET/timeline" -H "$A")
need "timeline lists events" 'Vomited' "$R"

echo "== F6/F7 分享与公开页 =="
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/shares" -H "$J" -H "$A" -d '{"kind":"summary","ttl_hours":72,"reason":"Vomiting since last night"}')
need "create summary share" '"url"' "$R"
SHARE_URL=$(echo "$R" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
R=$(curl -s -X POST "$BASE/api/v1/pets/$PET/shares" -H "$J" -H "$A" -d '{"kind":"care","ttl_hours":72}')
need "create care share" '"url"' "$R"
CARE_URL=$(echo "$R" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
R=$(curl -s "$SHARE_URL")
need "public summary page renders" "Why we're here" "$R"
R=$(curl -s "$CARE_URL")
need "public care card renders" 'CARING FOR' "$R"
R=$(curl -s "$BASE/api/v1/pets/$PET/shares" -H "$A")
need "view_count incremented" '"view_count":1\|"view_count":2' "$R"

echo "== F8 数据生命周期 =="
R=$(curl -s "$BASE/api/v1/pets/$PET/export" -H "$A")
need "export full dump" 'timeline_events' "$R"
R=$(curl -s -X DELETE "$BASE/api/v1/pets/$PET" -H "$A")
need "delete pet cascade" '"ok"' "$R"
R=$(curl -s "$BASE/api/v1/me" -H "$A")
if echo "$R" | grep -q 'Milo'; then bad "pet still in /me after delete"; else ok "pet gone from /me"; fi

echo "== 汇总 =="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "ALL GREEN ✓" || exit 1
