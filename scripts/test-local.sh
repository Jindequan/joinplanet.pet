#!/usr/bin/env bash
# Run the local regression suite against the already-running development stack.
# This script never starts a service and never opens a browser or device window.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://127.0.0.1:8081}"
METRO_BASE="${METRO_BASE:-http://127.0.0.1:5173}"

echo "== local runtime =="
curl -fsS "${API_BASE}/healthz" >/dev/null
curl -fsS "${API_BASE}/readyz" >/dev/null
curl -fsS "${METRO_BASE}/status" >/dev/null
echo "  ✓ API and Metro are reachable"

echo "== API regression =="
BASE="$API_BASE" "$ROOT_DIR/scripts/api-logic-test.sh"
BASE="$API_BASE" "$ROOT_DIR/scripts/api-walkthrough.sh"

echo "== frontend contracts =="
(cd "$ROOT_DIR/APP" && npm run typecheck && npm run lint && npm run verify:frontend)

echo "== result =="
echo "PASS — local regression completed without starting additional services"
