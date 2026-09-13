#!/usr/bin/env bash
# Phase C guard: L3–L4 feature screens must not import planetApi directly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "$ROOT/APP/src/features/trends"
  "$ROOT/APP/src/features/handoffs"
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
