#!/usr/bin/env bash
# Client layer import guards — foundation / extension / collaboration boundaries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

if rg -n "from ['\"].*features/" "$ROOT/APP/src/features" --glob '*.tsx' --glob '*.ts' 2>/dev/null | rg -v "features/today/model|features/pets/model|features/collaboration" ; then
  echo "FAIL: cross-feature imports detected" >&2
  FAIL=1
fi

for dir in trends handoffs pets/sharing-section.tsx collaboration; do
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
