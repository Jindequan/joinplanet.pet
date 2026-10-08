#!/usr/bin/env python3
"""ASC 提审收尾：一次输入审核联系人电话 → 修正审核信息 → whatsNew → 提交审核。

用法：
  python3 scripts/asc-submit.py "+86 1xx-xxxx-xxxx"          # 修正信息并提交
  python3 scripts/asc-submit.py --check                       # 只读：当前 ASC 状态盘点

背景（2026-09-29）：
  - 五语元数据（name/subtitle/keywords/promo/description/support/marketing）已全部经 API 写入。
  - 类别 Lifestyle（次 Health & Fitness）已设；build（commit 1d73ec0 的产物，VALID）已挂到版本。
  - 卡点只剩两件，都需要本脚本：①App Review Information 的 contactPhone 必填（任何 PATCH 都要求带
    电话才能保存），而仓库与 ASC 里都没有；②审核备注里存着一段与实际不符的旧文案
    （「无需账号、自动加载演示数据」——App 实为 Apple 登录、无内置演示数据，2.3.1 拒审风险），
    会被动覆盖为 docs/APPSTORE-METADATA.md §审核备注 的照实版本，并把 demoAccountRequired 置 false
    （App 是 Apple 登录，无法提供邮箱密码演示账号）。
"""
import json, re, sys, time
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from asc import ASC, BASE

ISSUER = "564deed7-6d63-4abf-acc7-e7692850a617"
KEY = "/Users/devin/secret/AuthKey_7D2L694J82.p8"
KID = "7D2L694J82"
APP_ID = "6813496739"
VER_ID = "8bee6100-7880-41a5-959a-3aa9edb018ca"
META = "/Users/devin/code/joinplanet.pet/docs/APPSTORE-METADATA.md"
WHATS = {"en-US": "First release.", "zh-Hans": "首次发布。", "ja": "初回リリース。",
         "es-ES": "Primera versión.", "pt-BR": "Primeira versão."}

a = ASC(ISSUER, KEY, KID)

def get(path, params=None):
    r = a.s.get(BASE + path, params=params, timeout=60)
    if r.status_code >= 400:
        print(f"!! GET {path} -> {r.status_code}: {r.text[:200]}"); sys.exit(2)
    return r.json()

def req(method, path, body=None, allow=()):
    r = a.s.request(method, BASE + path, json=body, timeout=60)
    if r.status_code >= 400 and r.status_code not in allow:
        print(f"!! {method} {path} -> {r.status_code}: {r.text[:400]}"); sys.exit(2)
    return r

ver = get(f"/v1/appStoreVersions/{VER_ID}")["data"]
print(f"version state: {ver['attributes']['appStoreState']}  build: {ver['relationships']['build'].get('data')}")
if not ver["relationships"]["build"].get("data"):
    # 自愈：把本仓最新提交（1d73ec0）对应的 VALID build 挂回版本（/v1/builds 列表索引会滞后，
    # 用 Xcode Cloud run 5e33db5c 的 builds 关系拿 id）
    BID = get("/v1/ciBuildRuns/5e33db5c-f7ea-4dc5-b006-999c8154807e/builds")["data"][0]["id"]
    b = get(f"/v1/builds/{BID}")["data"]
    print(f"  重新挂载 build {b['attributes']['version']}（{b['attributes']['processingState']}，来自 run 5e33db5c = commit 1d73ec0）")
    req("PATCH", f"/v1/appStoreVersions/{VER_ID}", {"data": {"type": "appStoreVersions", "id": VER_ID,
        "relationships": {"build": {"data": {"type": "builds", "id": BID}}}}})
    ver = get(f"/v1/appStoreVersions/{VER_ID}")["data"]
    print(f"  复核 build: {ver['relationships']['build'].get('data')}")
rd = get(f"/v1/appStoreVersions/{VER_ID}/appStoreReviewDetail")["data"]
print(f"reviewDetail: contact={rd['attributes']['contactFirstName']} demoRequired={rd['attributes']['demoAccountRequired']} notes={'<空>' if not rd['attributes']['notes'] else rd['attributes']['notes'][:40] + '…'}")

if len(sys.argv) < 2 or sys.argv[1] == "--check":
    print("\n（--check 只读模式：确认以上状态后，带电话号码运行即可提审）")
    sys.exit(0)

phone = sys.argv[1].strip()
assert re.match(r"^\+?[0-9][0-9 ().-]{6,}$", phone), f"电话格式看起来不对：{phone}"

# ---------- 1. 修正审核信息（备注取自事实源文档的照实版） ----------
meta = open(META, encoding="utf-8").read()
idx = meta.index("### 审核备注")
notes = [m.group(1) for m in re.finditer(r"```\n([\s\S]*?)\n```", meta[idx:])][0].strip()
RID = rd["id"]
r = req("PATCH", f"/v1/appStoreReviewDetails/{RID}", {"data": {"type": "appStoreReviewDetails", "id": RID,
    "attributes": {"contactFirstName": "Devin", "contactLastName": "Jin",
                   "contactEmail": "jindeq@126.com", "contactPhone": phone,
                   "demoAccountRequired": False, "notes": notes}}}, allow=(409,))
print(f"review detail -> {r.status_code}（409 则看错误体；成功后备注已是照实版、demo 要求已关）")

# ---------- 2. whatsNew（v1.0 首发预期为 409：What's New 字段只对更新版本存在，首发无此字段） ----------
vlocs = get(f"/v1/appStoreVersions/{VER_ID}/appStoreVersionLocalizations", {"limit": "20"})["data"]
for attempt in range(2):
    pending = []
    for l in vlocs:
        loc = l["attributes"]["locale"]
        if loc in WHATS:
            rr = req("PATCH", f"/v1/appStoreVersionLocalizations/{l['id']}",
                     {"data": {"type": "appStoreVersionLocalizations", "id": l["id"],
                               "attributes": {"whatsNew": WHATS[loc]}}}, allow=(409,))
            if rr.status_code >= 400:
                pending.append(loc)
    if not pending:
        print(f"whatsNew ×{len(vlocs)} 全部写入（若有更新版本时生效）")
        break
    if attempt == 0:
        print(f"whatsNew 锁定：{pending} —— v1.0 首发版无 What's New 字段，属预期，跳过")
        break

# ---------- 3. 提交审核（reviewSubmissions 三步） ----------
sub = req("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
    "attributes": {"platform": "IOS"},
    "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}}).json()["data"]
print(f"reviewSubmission draft: {sub['id']}  state={sub['attributes']['state']}")
req("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
    "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
                      "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VER_ID}}}}})
print("item attached")
req("PATCH", f"/v1/reviewSubmissions/{sub['id']}",
    {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
print("submitted=True 已发")

# ---------- 4. 轮询确认 ----------
for i in range(10):
    st = get(f"/v1/appStoreVersions/{VER_ID}")["data"]["attributes"]["appStoreState"]
    print(f"[{i}] appStoreState = {st}")
    if st in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
        print("\n✅ 已进入审核队列（WAITING_FOR_REVIEW）。结果邮件发 Apple ID 邮箱。")
        sys.exit(0)
    time.sleep(30)
print("\n⚠️ 提交后状态未变，去 ASC 网页看具体拦截项（可能的候选：App Privacy 问卷/出口合规/协议未签）")
