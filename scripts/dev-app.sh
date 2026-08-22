#!/usr/bin/env bash
# Foreground app launcher for a real device / Expo Go session.
#
# The backend is managed in the background, while Expo stays in the foreground
# so its QR code and the exact LAN URL remain visible in the terminal.
set -euo pipefail
MODE="${1:-device}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/mobile-v2"
API_PORT="${API_PORT:-8081}"
EXPO_PORT="${EXPO_PORT:-8082}"

if [ "$MODE" != "device" ]; then
  echo "Only device mode is supported by this launcher."
  echo "Use: $SCRIPT_DIR/dev.sh start all device"
  exit 2
fi

detect_lan_ip() {
  local interface_name address
  interface_name="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  for interface_name in "$interface_name" en0 en1 en2; do
    [ -n "$interface_name" ] || continue
    address="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
    if [ -n "$address" ]; then printf '%s' "$address"; return; fi
  done
}

LAN_IP="${LAN_IP:-$(detect_lan_ip)}"
if [ -z "$LAN_IP" ]; then
  echo "No LAN address found. Connect this Mac and iPhone to the same Wi-Fi, or set LAN_IP=192.168.x.x."
  exit 1
fi

"$SCRIPT_DIR/dev.sh" start backend
# A foreground Expo process must own the port so the QR and live logs are visible here.
"$SCRIPT_DIR/dev.sh" stop frontend >/dev/null 2>&1 || true

API_BASE_URL="http://${LAN_IP}:${API_PORT}/api/v1"
echo "PLANET device session"
echo "API:  ${API_BASE_URL}"
echo "LAN:  ${LAN_IP}"
echo "Keep this terminal open and scan the QR code below with Expo Go / Camera."
cd "$APP_DIR"
exec env EXPO_PUBLIC_API_BASE_URL="$API_BASE_URL" npx expo start --lan --go --port "$EXPO_PORT" --clear
