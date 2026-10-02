#!/usr/bin/env bash
# Real isolated PostgreSQL/API response -> actual public React page renderer.
# Historical pre-fix probes and failures remain archived beside this runner.
set -euo pipefail
REVIEW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$REVIEW_DIR/../../.." && pwd)"
SHARE_FIXTURE="$(mktemp "${TMPDIR:-/tmp}/planet-v11-share.XXXXXX")"
trap 'rm -f "$SHARE_FIXTURE"' EXIT
export PLANET_SHARE_CONTRACT_FIXTURE="$SHARE_FIXTURE"
cd "$PROJECT_DIR/planet-api"
go test ./test/integration -run '^(TestDateSelectedCompletion.*|TestReciprocalDateBackfillsDoNotDeadlock|TestPublicCareCardPreservesCompletionAndSnapshot)$' -count=1 -v
cd "$PROJECT_DIR/www.joinplanet.pet"
node --test tests/shared-care.test.mjs
