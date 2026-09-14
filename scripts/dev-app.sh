#!/usr/bin/env bash
# Foreground local Metro launcher for the iOS Simulator session.
#
# The backend is managed in the background, while Expo stays in the foreground
# so its QR code and the exact LAN URL remain visible in the terminal.
set -euo pipefail
MODE="${1:-simulator}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/APP"
API_PORT="${API_PORT:-8081}"
EXPO_PORT="${EXPO_PORT:-8082}"

if [ "$MODE" != "simulator" ]; then
  echo "Physical-device mode is disabled. Use simulator mode or ./scripts/ios.sh."
  exit 2
fi

"$SCRIPT_DIR/dev.sh" start backend
# A foreground Expo process must own the port so the QR and live logs are visible here.
"$SCRIPT_DIR/dev.sh" stop frontend >/dev/null 2>&1 || true

API_BASE_URL="http://127.0.0.1:${API_PORT}/api/v1"
echo "PLANET Simulator Metro session"
echo "API:  ${API_BASE_URL}"
echo "Open the native Simulator with ./scripts/ios.sh; this launcher never targets a physical device."
cd "$APP_DIR"
exec env EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_BASE_URL="$API_BASE_URL" EXPO_PUBLIC_EAS_PROJECT_ID="${EXPO_PUBLIC_EAS_PROJECT_ID:-}" npx expo start --localhost --port "$EXPO_PORT" --clear
