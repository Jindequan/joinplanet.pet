#!/usr/bin/env bash
# Phase C guard: L3–L4 feature screens must not import planetApi directly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# IA 2026-09-28：features/handoffs 整目录已删（批量交班并入
# features/care-requests/batch-panel.tsx），TARGETS 同步清该行——它在
# `2>/dev/null` 下静默空跑，是会烂在清单里的那类锚点。
TARGETS=(
  "$ROOT/APP/src/features/trends"
  "$ROOT/APP/src/features/settings/public-share-screen.tsx"
  "$ROOT/APP/src/features/pets/sharing-section.tsx"
)

FAIL=0
for target in "${TARGETS[@]}"; do
  if rg -n "planetApi\." "$target" 2>/dev/null; then
    echo "FAIL: direct planetApi in $target" >&2
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "PASS — extension features use core/extension or foundation"
fi
exit "$FAIL"
