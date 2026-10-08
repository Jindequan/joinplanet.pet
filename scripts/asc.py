#!/usr/bin/env python3
"""
App Store Connect API client — proven in production 2026-09 (Cove 1.0, 6 locales).

Usage:
  asc.py verify   --app-id ID --issuer UUID [--key PATH --kid KID]
  asc.py appinfo  --app-id ID --issuer UUID --locale es-ES --name "..." --subtitle "..." [--privacy-url URL]
  asc.py meta     --app-id ID --issuer UUID --locale es-ES [--desc-file F] [--keywords K] [--promo P] [--support U] [--marketing U]
  asc.py shots    --app-id ID --issuer UUID --locale es-ES --dir ./shots [--display APP_IPHONE_65]
  asc.py submit   --app-id ID --issuer UUID [--ver-id V]

Defaults: DRYRUN=1 (prints plan, no writes). Set DRYRUN=0 to write.
Order of operations: verify first, then appinfo/meta/shots, submit last.
Key defaults: KEY_PATH=~/secret/AuthKey_<KID>.p8, pass --key/--kid or env ASC_KEY/ASC_KID.
"""
import argparse, base64, hashlib, json, os, sys, time
import jwt, requests
from PIL import Image

BASE = "https://api.appstoreconnect.apple.com"  # NOT api.appstoreconnect.com


def token(issuer, key_path, key_id):
    now = int(time.time())
    return jwt.encode({"iss": issuer, "iat": now, "exp": now + 900,
                       "aud": "appstoreconnect-v1"},
                      open(key_path).read(), algorithm="ES256",
                      headers={"kid": key_id, "typ": "JWT"})


class ASC:
    def __init__(self, issuer, key_path, key_id):
        self.s = requests.Session()
        self.s.headers["Authorization"] = "Bearer " + token(issuer, key_path, key_id)

    def req(self, method, path, json_body=None, params=None, allow=None):
        r = self.s.request(method, BASE + path, json=json_body, params=params, timeout=60)
        if r.status_code >= 400:
            try:
                errs = r.json().get("errors", [r.json()])
            except Exception:
                errs = [{"detail": r.text[:300]}]
            msg = "; ".join(e.get("detail") or e.get("title") or "?" for e in errs)
            if allow and r.status_code in allow:
                print(f"  (allowed {r.status_code}: {msg[:160]})")
                return None
            print(f"  !! HTTP {r.status_code} {method} {path}: {msg[:400]}")
            sys.exit(2)
        return r.json() if r.text else {}

    def get_all(self, path, params=None):
        out, url, p = [], path, dict(params or {})
        while url:
            d = self.req("GET", url, params=p)
            out += d.get("data", [])
            nxt = d.get("links", {}).get("next")
            url, p = (nxt, None) if nxt else (None, None)
        return out

    # -- screenshots -------------------------------------------------------
    def ensure_set(self, vloc_id, display="APP_IPHONE_65"):
        sets = self.get_all(f"/v1/appStoreVersionLocalizations/{vloc_id}/appScreenshotSets",
                            {"filter[screenshotDisplayType]": display})
        if sets:
            return sets[0]["id"]
        made = self.req("POST", "/v1/appScreenshotSets",
            {"data": {"type": "appScreenshotSets",
                      "attributes": {"screenshotDisplayType": display},
                      "relationships": {"appStoreVersionLocalization": {"data": {
                          "type": "appStoreVersionLocalizations", "id": vloc_id}}}}})
        return made["data"]["id"]

    def upload_screenshot(self, set_id, path):
        data = open(path, "rb").read()
        w, h = Image.open(path).size
        if (w, h) not in ((1284, 2778), (1290, 2796), (1179, 2556), (2048, 2732), (2048, 2732)):
            print(f"  !! {path} size {(w, h)} not an ASC-accepted size — will be rejected at submit")
            sys.exit(2)
        reserved = self.req("POST", "/v1/appScreenshots",
            {"data": {"type": "appScreenshots",
                      "attributes": {"fileName": os.path.basename(path), "fileSize": len(data)},
                      "relationships": {"appScreenshotSet": {"data": {
                          "type": "appScreenshotSets", "id": set_id}}}}})["data"]
        sid = reserved["id"]
        for op in reserved["attributes"]["uploadOperations"]:
            headers = {h.get("name") or h.get("key"): h["value"]
                       for h in (op.get("requestHeaders") or [])}
            r = requests.request(op["method"], op["url"],
                                 data=data[op["offset"]:op["offset"] + op["length"]],
                                 headers=headers, timeout=180)
            if r.status_code not in (200, 204):
                print(f"  !! binary upload failed HTTP {r.status_code}")
                sys.exit(2)
        self.req("PATCH", f"/v1/appScreenshots/{sid}",
            {"data": {"type": "appScreenshots", "id": sid,
                      "attributes": {"uploaded": True,
                                     "sourceFileChecksum":
                                         base64.b64encode(hashlib.md5(data).digest()).decode()}}})
        return sid


def inflight_version(asc, app_id):
    vers = asc.get_all(f"/v1/apps/{app_id}/appStoreVersions",
                       {"filter[appStoreState]":
                        "PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,WAITING_FOR_REVIEW,IN_REVIEW"})
    if not vers:
        sys.exit("  !! no editable version found")
    v = vers[0]
    print(f"   version {v['attributes']['versionString']} state={v['attributes']['appStoreState']} id={v['id']}")
    return v["id"]


def cmd_verify(asc, a):
    app = asc.req("GET", f"/v1/apps/{a.app_id}")["data"]
    print("app:", app["attributes"]["name"], "|", app["attributes"]["bundleId"])
    infos = asc.get_all(f"/v1/apps/{a.app_id}/appInfos")
    locs = asc.get_all(f"/v1/appInfos/{infos[0]['id']}/appInfoLocalizations")
    for l in sorted(locs, key=lambda x: x["attributes"]["locale"]):
        at = l["attributes"]
        print(f"  appinfo {at['locale']:<8} name={at.get('name')!r} sub={at.get('subtitle')!r} "
              f"privacy={'Y' if at.get('privacyPolicyUrl') else 'N'}")
    ver_id = inflight_version(asc, a.app_id)
    vlocs = asc.get_all(f"/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations")
    for l in vlocs:
        at = l["attributes"]
        ok = all([at.get("description"), at.get("keywords"), at.get("promotionalText"), at.get("supportUrl")])
        print(f"  ver {at['locale']:<8} desc={len(at.get('description') or '')} kw={len(at.get('keywords') or '')} "
              f"promo={len(at.get('promotionalText') or '')} support={'Y' if at.get('supportUrl') else 'N'} "
              f"-> {'OK' if ok else 'MISSING!'}")
    for l in vlocs:
        sets = asc.get_all(f"/v1/appStoreVersionLocalizations/{l['id']}/appScreenshotSets",
                           {"filter[screenshotDisplayType]": a.display})
        n = len(asc.get_all(f"/v1/appScreenshotSets/{sets[0]['id']}/appScreenshots")) if sets else 0
        print(f"  shots {l['attributes']['locale']:<8} {n} ({a.display})")
    print(f"version id for submit: {ver_id}")


def cmd_appinfo(asc, a):
    infos = asc.get_all(f"/v1/apps/{a.app_id}/appInfos")
    locs = asc.get_all(f"/v1/appInfos/{infos[0]['id']}/appInfoLocalizations")
    by = {l["attributes"]["locale"]: l for l in locs}
    attrs = {k: v for k, v in (("name", a.name), ("subtitle", a.subtitle),
                               ("privacyPolicyUrl", a.privacy_url)) if v}
    print(f"{a.locale}: {attrs}")
    if os.environ.get("DRYRUN", "1") != "0":
        return
    if a.locale in by:
        lid = by[a.locale]["id"]
        asc.req("PATCH", f"/v1/appInfoLocalizations/{lid}",
                {"data": {"type": "appInfoLocalizations", "id": lid, "attributes": attrs}})
    else:
        asc.req("POST", "/v1/appInfoLocalizations",
                {"data": {"type": "appInfoLocalizations",
                          "attributes": {"locale": a.locale, **attrs},
                          "relationships": {"appInfo": {"data": {
                              "type": "appInfos", "id": infos[0]["id"]}}}}})


def cmd_meta(asc, a):
    ver_id = inflight_version(asc, a.app_id)
    vlocs = asc.get_all(f"/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations")
    by = {l["attributes"]["locale"]: l for l in vlocs}
    attrs = {}
    if a.desc_file:  attrs["description"] = open(a.desc_file).read()
    if a.keywords:   attrs["keywords"] = a.keywords
    if a.promo:      attrs["promotionalText"] = a.promo
    if a.support:    attrs["supportUrl"] = a.support
    if a.marketing:  attrs["marketingUrl"] = a.marketing
    if a.whats_new:  attrs["whatsNew"] = a.whats_new
    print(f"{a.locale}: {{{', '.join(f'{k}: {len(v)}ch' for k, v in attrs.items())}}}")
    if os.environ.get("DRYRUN", "1") != "0":
        return
    if a.locale in by:
        lid = by[a.locale]["id"]
        asc.req("PATCH", f"/v1/appStoreVersionLocalizations/{lid}",
                {"data": {"type": "appStoreVersionLocalizations", "id": lid, "attributes": attrs}})
    else:
        asc.req("POST", "/v1/appStoreVersionLocalizations",
                {"data": {"type": "appStoreVersionLocalizations",
                          "attributes": {"locale": a.locale, **attrs},
                          "relationships": {"appStoreVersion": {"data": {
                              "type": "appStoreVersions", "id": ver_id}}}}})


def cmd_shots(asc, a):
    ver_id = inflight_version(asc, a.app_id)
    vlocs = asc.get_all(f"/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations")
    vloc = next((l for l in vlocs if l["attributes"]["locale"] == a.locale), None)
    if not vloc:
        sys.exit(f"  !! locale {a.locale} has no version localization — create it first")
    sets = asc.get_all(f"/v1/appStoreVersionLocalizations/{vloc['id']}/appScreenshotSets",
                       {"filter[screenshotDisplayType]": a.display})
    shots = asc.get_all(f"/v1/appScreenshotSets/{sets[0]['id']}/appScreenshots") if sets else []
    print(f"{a.locale}: {len(shots)} existing")
    files = sorted(f for f in os.listdir(a.dir) if f.endswith(".png"))
    if files and shots:
        stale = [s for s in shots if s["attributes"].get("uploaded") is not True
                 and s["attributes"]["fileName"] in files]
        if len(stale) != len(shots):
            sys.exit(f"  !! {a.locale} has {len(shots)} shots not created by this run — manual review")
        if os.environ.get("DRYRUN", "1") == "0":
            for s in stale:
                print(f"   delete stale reservation {s['attributes']['fileName']}")
                asc.req("DELETE", f"/v1/appScreenshots/{s['id']}")
            shots = []
    if shots:
        print("   already complete")
        return
    if os.environ.get("DRYRUN", "1") == "0":
        set_id = asc.ensure_set(vloc["id"])
        for f in files:
            print(f"   + {f}")
            asc.upload_screenshot(set_id, os.path.join(a.dir, f))


def cmd_submit(asc, a):
    ver_id = a.ver_id or inflight_version(asc, a.app_id)
    subs = asc.get_all(f"/v1/apps/{a.app_id}/reviewSubmissions")
    drafts = [s for s in subs if s["attributes"]["state"] == "READY_FOR_REVIEW"]
    if drafts:
        sub_id = drafts[0]["id"]
        print("reuse draft", sub_id)
    else:
        made = asc.req("POST", "/v1/reviewSubmissions",
            {"data": {"type": "reviewSubmissions",
                      "attributes": {"platform": "IOS"},
                      "relationships": {"app": {"data": {"type": "apps", "id": a.app_id}}}}})
        sub_id = made["data"]["id"]
        print("created draft", sub_id)
    items = asc.get_all(f"/v1/reviewSubmissions/{sub_id}/items")
    if not any((it["relationships"].get("appStoreVersion", {}).get("data") or {}).get("id") == ver_id
               for it in items):
        asc.req("POST", "/v1/reviewSubmissionItems",
            {"data": {"type": "reviewSubmissionItems",
                      "relationships": {"reviewSubmission": {"data": {
                                            "type": "reviewSubmissions", "id": sub_id}},
                                        "appStoreVersion": {"data": {
                                            "type": "appStoreVersions", "id": ver_id}}}}})
        print("attached version", ver_id)
    if os.environ.get("DRYRUN", "1") == "0":
        asc.req("PATCH", f"/v1/reviewSubmissions/{sub_id}",
                {"data": {"type": "reviewSubmissions", "id": sub_id,
                          "attributes": {"submitted": True}}})
        print("submitted — polling state:")
        for _ in range(10):
            time.sleep(15)
            v = asc.req("GET", f"/v1/appStoreVersions/{ver_id}")
            state = v["data"]["attributes"]["appStoreState"]
            print("  ", state)
            if state == "WAITING_FOR_REVIEW":
                return


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["verify", "appinfo", "meta", "shots", "submit"])
    p.add_argument("--app-id", required=True)
    p.add_argument("--issuer", required=True)
    p.add_argument("--kid", default=os.environ.get("ASC_KID"))
    p.add_argument("--key", default=os.environ.get("ASC_KEY"))
    p.add_argument("--locale", default="en-US")
    p.add_argument("--display", default="APP_IPHONE_65")
    p.add_argument("--dir", default=".")
    p.add_argument("--name");  p.add_argument("--subtitle"); p.add_argument("--privacy-url")
    p.add_argument("--desc-file"); p.add_argument("--keywords"); p.add_argument("--promo")
    p.add_argument("--support"); p.add_argument("--marketing"); p.add_argument("--whats-new")
    p.add_argument("--ver-id")
    a = p.parse_args()
    kid = a.kid or (os.path.basename(a.key or "").replace("AuthKey_", "").replace(".p8", "")
                    if a.key else None)
    if not (a.key and kid):
        sys.exit("need --key (p8 path) and --kid, or ASC_KEY/ASC_KID env")
    asc = ASC(a.issuer, os.path.expanduser(a.key), kid)
    {"verify": cmd_verify, "appinfo": cmd_appinfo, "meta": cmd_meta,
     "shots": cmd_shots, "submit": cmd_submit}[a.cmd](asc, a)


if __name__ == "__main__":
    main()
