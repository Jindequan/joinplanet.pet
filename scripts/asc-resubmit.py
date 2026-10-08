#!/usr/bin/env python3
"""2.1(b)/2.3.10 整改后的重提审：盘点 → 挂 build → submitted → 轮询确认。

用法：
  python3 scripts/asc-resubmit.py check            # 只读盘点：版本/build/截图/submission 状态
  python3 scripts/asc-resubmit.py submit --yes     # 真重提审——先在 Resolution Center 回复 2.1(b) 之后再跑

背景（2026-10-08）：
  - v1.0（build 83）首审收到 Guideline 2.1(b)（商业模式问询）+ 2.3.10（截图含手绘状态栏）。
  - 已完成：6 张截图用 build-83 同代 raw（git 1d73ec0，--raw-dir 重出）重合成去状态栏版并经
    API 原序替换（assetDelivery 全 COMPLETE）。
  - ASC 行为两则：拒审版本一经编辑自动转 PREPARE_FOR_SUBMISSION 且**摘掉 build 关系**（重提前必须
    挂回，本脚本幂等处理并强断言）；版本 GET 的 relationships.build.data 回显不可靠，以
    GET /appStoreVersions/{id}/build 子资源为准（未挂载时该子资源 404，属正常）。
  - Resolution Center 无公开 API：2.1(b) 回复稿在 docs/APPSTORE-METADATA.md §六·五，网页手动发。
"""
import argparse, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asc import ASC, BASE

ISSUER = "564deed7-6d63-4abf-acc7-e7692850a617"
KEY = "/Users/devin/secret/AuthKey_7D2L694J82.p8"
KID = "7D2L694J82"
APP_ID = "6813496739"
VER_ID = "8bee6100-7880-41a5-959a-3aa9edb018ca"
SUB_ID = "38c84ca8-3aa7-4897-a7f6-6cc0a4cc6598"
BUILD_NUM = "83"
EDITABLE = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "METADATA_REJECTED", "REJECTED")

a = ASC(ISSUER, KEY, KID)

def get(path, params=None):
    r = a.s.get(BASE + path, params=params, timeout=60)
    if r.status_code >= 400:
        print(f"!! GET {path} -> {r.status_code}: {r.text[:200]}"); sys.exit(2)
    return r.json()

def try_get(path, params=None):
    """容错读：返回 (json, None)；失败返回 (None, status)。用于合法 404（如未挂载的 build 子资源）。"""
    r = a.s.get(BASE + path, params=params, timeout=60)
    return (r.json(), None) if r.status_code < 400 else (None, r.status_code)

def req(method, path, body=None):
    r = a.s.request(method, BASE + path, json=body, timeout=60)
    if r.status_code >= 400:
        print(f"!! {method} {path} -> {r.status_code}: {r.text[:400]}")
        return None
    return r

def find_build():
    data = get("/v1/builds", {"filter[app]": APP_ID, "filter[version]": BUILD_NUM, "limit": "5"})["data"]
    if not data:
        print(f"!! build {BUILD_NUM} 未找到（过期或版本号过滤写错）"); sys.exit(2)
    b = data[0]
    if b["attributes"]["processingState"] != "VALID" or b["attributes"]["expired"]:
        print(f"!! build {BUILD_NUM} 非 VALID/已过期"); sys.exit(2)
    return b

def check_build_attached():
    """返回已挂载 build 的 id；未挂载返回 None（子资源 404 = 脱挂）。"""
    j, status = try_get(f"/v1/appStoreVersions/{VER_ID}/build")
    if j is None:
        if status == 404:
            return None
        print(f"!! 读 build 子资源异常 HTTP {status}"); sys.exit(2)
    return (j.get("data") or {}).get("id")

def check_shots():
    locs = get(f"/v1/appStoreVersions/{VER_ID}/appStoreVersionLocalizations", {"limit": "20"})["data"]
    for loc in locs:
        for st in get(f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")["data"]:
            shots = get(f"/v1/appScreenshotSets/{st['id']}/appScreenshots")["data"]
            bad = [s for s in shots if s["attributes"]["assetDeliveryState"]["state"] != "COMPLETE"]
            print(f"截图 {loc['attributes']['locale']:<7} {st['attributes']['screenshotDisplayType']}: "
                  f"{len(shots)} 张，未完成 {len(bad)}")
            if bad:
                print(f"!! 存在未 COMPLETE 截图: {[s['attributes']['fileName'] for s in bad]}"); sys.exit(2)

def show_submissions():
    for s in get("/v1/reviewSubmissions", {"filter[app]": APP_ID, "limit": "5"})["data"]:
        print(f"submission: {s['id']}  {s['attributes']['state']}")

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="只读盘点")
    p = sub.add_parser("submit", help="真重提审")
    p.add_argument("--yes", action="store_true", help="确认门：已知悉重提会重置队列位置")
    args = ap.parse_args()

    state = get(f"/v1/appStoreVersions/{VER_ID}")["data"]["attributes"]["appStoreState"]
    print(f"version 1.0 state: {state}")

    if args.cmd == "check":
        b = find_build()
        attached = check_build_attached()
        print(f"build {BUILD_NUM}（{b['id']}）: " + ("已挂载" if attached == b["id"]
              else f"未挂载（子资源读到 {attached}）——submit 模式会幂等挂载"))
        check_shots()
        show_submissions()
        print("\n（check 只读。重提前确认 Resolution Center 已回复 2.1(b)：回复稿见"
              " docs/APPSTORE-METADATA.md §六·五。）")
        return

    # ---- submit：以下全部是写路径 ----
    if not args.yes:
        print("确认门：submit 会把 v1.0 重新送入审核队列（队列位置重置）。\n"
              "前提：已在 ASC Resolution Center 回复 2.1(b)。确认后加 --yes 重跑。")
        sys.exit(1)
    if state not in EDITABLE:
        print(f"!! 版本状态 {state} 不可提审——先看 ASC 网页当前卡点"); sys.exit(2)

    b = find_build()
    if check_build_attached() != b["id"]:
        req("PATCH", f"/v1/appStoreVersions/{VER_ID}", {"data": {"type": "appStoreVersions", "id": VER_ID,
            "relationships": {"build": {"data": {"type": "builds", "id": b["id"]}}}}})
        time.sleep(10)
    attached = check_build_attached()
    print(f"build 复核: {attached}")
    if attached != b["id"]:
        print("!! build 未能挂载到位——不进入提审。回退：ASC 网页版本页 Build 段手选 build 83。"); sys.exit(3)

    check_shots()

    r = req("PATCH", f"/v1/reviewSubmissions/{SUB_ID}",
            {"data": {"type": "reviewSubmissions", "id": SUB_ID, "attributes": {"submitted": True}}})
    if r is None:
        print("原 submission 复用被拒，改走新建流程…")
        made = req("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
            "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
        if made is None:
            print("\n!! API 两条路都未收下。回退：ASC 网页 → App → 版本页 → 添加以供审核"
                  "（Resolution Center 回复后网页会引导解决未决问题）。"); sys.exit(3)
        sub = made.json()["data"]
        print(f"reviewSubmission draft: {sub['id']}  state={sub['attributes']['state']}")
        item = req("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
            "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
                              "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VER_ID}}}}})
        if item is None:
            print(f"!! item 挂载失败（draft {sub['id']} 未提审）。回退：ASC 网页操作。"); sys.exit(3)
        print(f"item attached: {item.json()['data']['id']}")
        r = req("PATCH", f"/v1/reviewSubmissions/{sub['id']}",
                {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
    if r is None:
        print("\n!! 提交 PATCH 未被收下。回退：ASC 网页 → App → 版本页 → 添加以供审核。"); sys.exit(3)
    print("submitted=True 已发")

    for i in range(10):
        time.sleep(30)
        st = get(f"/v1/appStoreVersions/{VER_ID}")["data"]["attributes"]["appStoreState"]
        print(f"[{i}] appStoreState = {st}")
        if st == "WAITING_FOR_REVIEW":
            print("\n✅ 已重新进入审核队列（WAITING_FOR_REVIEW）。结果邮件发 Apple ID 邮箱。")
            return
    print("\n⚠️ 提交后状态未变，去 ASC 网页看具体拦截项")
    sys.exit(3)

if __name__ == "__main__":
    main()
