#!/usr/bin/env bash
# Client layer import guards — foundation / extension / collaboration boundaries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

# 跨 feature 互引检测(2026-10-16 重写)。旧版只匹配字面量 `features/`,而真实
# 跨模块引用全是 `../<feature>/` 相对路径——守卫形同虚设(exit 0 放行 9 处违规,
# 重构审计 P1)。现按路径真实解析;ALLOWED_CROSS_FEATURE=存量白名单(重构批3
# 逐条消除,清零后整段删除)。collaboration 是共享内核性质的目标,引用它合法。
violations=$(
python3 - "$ROOT/APP/src/features" <<'PY'
import os, re, sys
root = sys.argv[1]
allowed = {
    "activation/screen.tsx:../today/setup-journey",
    "activation/setup-care-screen.tsx:../pets/care-section",
    "activation/today-invite-gate.tsx:../families/invite-sheet",
    "families/detail-screen.tsx:../collaboration/care-responsibility-banner",
    "settings/public-share-screen.tsx:../timeline/registry",
    "timeline/screen.tsx:../today/calendar-sheet",
    "today/cards.tsx:../care-requests/copy",
    "today/screen.tsx:../activation/today-invite-gate",
    "today/today-notices.tsx:../care-requests/batch-panel",
    "today/today-sheets.tsx:../care-requests/panel",
}
bad = []
for dirpath, _, files in os.walk(root):
    for fn in files:
        if not fn.endswith((".ts", ".tsx")):
            continue
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, root)
        mine = rel.split(os.sep)[0]
        try:
            src = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for m in re.finditer(r"(?:from\s+|require\()['\"](\.\./[^'\"]+)['\"]", src):
            spec = m.group(1)
            base = os.path.normpath(os.path.join(os.path.dirname(path), spec))
            rel_base = os.path.relpath(base, root)
            if rel_base.startswith(".."):
                continue
            top = rel_base.split(os.sep)[0]
            if top in (".", mine, "collaboration"):
                continue
            if os.path.isdir(os.path.join(root, top)) and f"{rel}:{spec}" not in allowed:
                bad.append(f"{rel}:{spec}")
for b in sorted(set(bad)):
    print(b)
PY
)
if [ -n "$violations" ]; then
  echo "FAIL: cross-feature imports detected (outside allowlist):" >&2
  echo "$violations" >&2
  FAIL=1
fi

# features/handoffs 整目录已删（批量交班并入 features/care-requests/batch-panel.tsx），
# 从本清单移除——它已靠 `[ -e ]` 静默跳过，留在清单里只会烂成陈旧锚点。
for dir in trends pets/sharing-section.tsx collaboration; do
  target="$ROOT/APP/src/features/$dir"
  if [ -e "$target" ] && rg -n "planetApi\." "$target" 2>/dev/null; then
    echo "FAIL: direct planetApi in extension feature $dir" >&2
    FAIL=1
  fi
done

if rg -n "HandoffStrip" "$ROOT/APP/src/features/today" 2>/dev/null; then
  echo "FAIL: Today must use CareResponsibilityBanner" >&2
  FAIL=1
fi

# A Pet-scoped Today read must carry the same family context used for its
# civil-day calculation. Keep the resolver as the single construction point.
if rg -n -U "foundationReaders\\.today\\(\\{\\s*pet_id:[^,}]+\\s*\\}\\)" "$ROOT/APP/src" --glob '*.ts' --glob '*.tsx' 2>/dev/null; then
  echo "FAIL: unscoped Pet Today query detected; use resolveTodayQuery with family context" >&2
  FAIL=1
fi

# Offline completion/skip is a user fact and must be replayed from the
# authenticated shell, even when Today is not mounted.
for symbol in syncPendingCareTaskQueue subscribePendingCareTasks; do
  if ! rg -q "$symbol" "$ROOT/APP/src/core/providers/session-provider.tsx"; then
    echo "FAIL: authenticated shell is missing durable Today queue sync: $symbol" >&2
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "PASS — client layer boundaries"
fi
exit "$FAIL"
