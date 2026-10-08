#!/usr/bin/env python3
"""2.1(b)/2.3.10 整改后的重提审：盘点物料 → 挂 build → submitted → 轮询确认。

用法：
  python3 scripts/asc-resubmit.py --check    # 只读：版本/build/截图/提审状态盘点
  python3 scripts/asc-resubmit.py            # 真提审——先在 Resolution Center 回复 Apple 之后再跑

背景（2026-10-08）：
  - v1.0（build 83）首审收到 Guideline 2.1(b)（商业模式问询）+ 2.3.10（截图含手绘状态栏）。
  - 已完成：6 张截图用 build-83 同代 raw（1d73ec0）重合成去状态栏版并经 API 原序替换
    （assetDelivery 全 COMPLETE）；版本随编辑自动转 PREPARE_FOR_SUBMISSION，build 83 重新挂载。
  - 剩最后一步：在 ASC Resolution Center 回复 2.1(b) 四问（回复稿见 docs/APPSTORE-METADATA.md §六·五），
    然后跑本脚本重提审。Resolution Center 无公开 API，回复只能网页操作。
"""
import sys, time
sys.path.insert(0, "/tmp")
from asc import ASC, BASE

ISSUER = "564deed7-6d63-4abf-acc7-e7692850a617"
KEY = "/Users/devin/secret/AuthKey_7D2L694J82.p8"
KID = "7D2L694J82"
APP_ID = "6813496739"
VER_ID = "8bee6100-7880-41a5-959a-3aa9edb018ca"
SUB_ID = "38c84ca8-3aa7-4897-a7f6-6cc0a4cc6598"
BUILD_NUM = "83"

a = ASC(ISSUER, KEY, KID)

def get(path, params=None):
    r = a.s.get(BASE + path, params=params, timeout=60)
    if r.status_code >= 400:
        print(f"!! GET {path} -> {r.status_code}: {r.text[:200]}"); sys.exit(2)
    return r.json()

def req(method, path, body=None):
    r = a.s.request(method, BASE + path, json=body, timeout=60)
    if r.status_code >= 400:
        print(f"!! {method} {path} -> {r.status_code}: {r.text[:400]}")
        return None
    return r

ver = get(f"/v1/appStoreVersions/{VER_ID}")["data"]
state = ver["attributes"]["appStoreState"]
print(f"version 1.0 state: {state}")
if state not in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "METADATA_REJECTED", "REJECTED"):
    print("!! 版本不在可编辑状态——先看 ASC 网页当前卡点"); sys.exit(2)

# build 挂载（幂等）：拒审版本被编辑后 build 关系会被 ASC 摘掉，重提前必须挂回
b = get("/v1/builds", {"filter[app]": APP_ID, "filter[version]": BUILD_NUM, "limit": "5"})["data"][0]
assert b["attributes"]["processingState"] == "VALID" and not b["attributes"]["expired"], "build 非 VALID"
attached = get(f"/v1/appStoreVersions/{VER_ID}/build")["data"]
if attached.get("id") != b["id"]:
    req("PATCH", f"/v1/appStoreVersions/{VER_ID}", {"data": {"type": "appStoreVersions", "id": VER_ID,
        "relationships": {"build": {"data": {"type": "builds", "id": b["id"]}}}}})
    time.sleep(10)
    attached = get(f"/v1/appStoreVersions/{VER_ID}/build")["data"]
    print(f"build 挂载后复核: {attached.get('id')}（attributes.version={attached.get('attributes', {}).get('version')}）")
else:
    print(f"build {BUILD_NUM} 已在位（{b['id']}）")
# 注：版本 GET 的 relationships.build.data 回显不可靠，以 /build 子资源为准

sets = get(f"/v1/appStoreVersions/{VER_ID}/appStoreVersionLocalizations", {"limit": "20"})["data"]
for loc in sets:
    ss = get(f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")["data"]
    for st in ss:
        shots = get(f"/v1/appScreenshotSets/{st['id']}/appScreenshots")["data"]
        bad = [s for s in shots if s["attributes"]["assetDeliveryState"]["state"] != "COMPLETE"]
        print(f"截图 {loc['attributes']['locale']:<7} {st['attributes']['screenshotDisplayType']}: "
              f"{len(shots)} 张，未完成 {len(bad)}")
        assert not bad, f"存在未 COMPLETE 的截图: {[s['attributes']['fileName'] for s in bad]}"

if len(sys.argv) > 1 and sys.argv[1] == "--check":
    subs = get("/v1/reviewSubmissions", {"filter[app]": APP_ID, "limit": "5"})["data"]
    for s in subs:
        print(f"submission: {s['id']}  {s['attributes']['state']}")
    print("\n（--check 只读模式。重提前确认 Resolution Center 已回复 2.1(b)。）")
    sys.exit(0)

# 重提审：优先复用原 submission（UNRESOLVED_ISSUES），不行则新建
r = req("PATCH", f"/v1/reviewSubmissions/{SUB_ID}",
        {"data": {"type": "reviewSubmissions", "id": SUB_ID, "attributes": {"submitted": True}}})
if r is None:
    print("原 submission 复用被拒，改走新建流程…")
    sub = req("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
        "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}}).json()["data"]
    print(f"reviewSubmission draft: {sub['id']}  state={sub['attributes']['state']}")
    req("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
        "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
                          "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VER_ID}}}}})
    print("item attached")
    r = req("PATCH", f"/v1/reviewSubmissions/{sub['id']}",
            {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
if r is None:
    print("\n!! API 两条路都未收下。回退：ASC 网页 → App → 版本页 → 添加以供审核"
          "（Resolution Center 回复后网页会引导解决未决问题）。"); sys.exit(3)
print("submitted=True 已发")

for i in range(10):
    time.sleep(30)
    st = get(f"/v1/appStoreVersions/{VER_ID}")["data"]["attributes"]["appStoreState"]
    print(f"[{i}] appStoreState = {st}")
    if st == "WAITING_FOR_REVIEW":
        print("\n✅ 已重新进入审核队列（WAITING_FOR_REVIEW）。结果邮件发 Apple ID 邮箱。")
        sys.exit(0)
print("\n⚠️ 提交后状态未变，去 ASC 网页看具体拦截项")
sys.exit(3)
