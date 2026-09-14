#!/usr/bin/env bash
# Launch PLANET native APP on iOS simulator using Xcode-beta.
# This script is intentionally simulator-only. Do not add a physical-device
# fallback here: local notification/UI acceptance must never install on a
# user's phone by accident.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ensure-xcode-beta.sh
source "$ROOT_DIR/scripts/ensure-xcode-beta.sh"

APP_DIR="$ROOT_DIR/APP"
API_PORT="${API_PORT:-8081}"
EXPO_PORT="${EXPO_PORT:-8082}"
API_BIN="$ROOT_DIR/planet-api/bin/planet-api"
IOS_DERIVED_DATA="${IOS_DERIVED_DATA:-$ROOT_DIR/.dev/ios-derived}"
NODE_BIN_DIR="$(dirname "$(command -v node)")"

# The API and Metro launch paths both write diagnostics and process state
# below .dev. Create it before either service can be started.
mkdir -p "$ROOT_DIR/.dev"

api_binary_needs_rebuild() {
  [ ! -x "$API_BIN" ] && return 0
  find "$ROOT_DIR/planet-api" -type f -name '*.go' -newer "$API_BIN" -print -quit 2>/dev/null | grep -q .
}

API_BINARY_STALE=0
if api_binary_needs_rebuild; then
  API_BINARY_STALE=1
  echo "planet-api binary is older than the current Go sources; rebuilding"
  (cd "$ROOT_DIR/planet-api" && go build -o "$API_BIN" ./cmd/planet-api)
fi

# If the healthy port is served by the stale prebuilt binary, restart only that
# process. A healthy response alone is not proof that it matches this checkout.
if [ "$API_BINARY_STALE" = 1 ]; then
  while read -r API_PID; do
    [ -n "$API_PID" ] || continue
    API_COMMAND="$(ps -p "$API_PID" -o command= 2>/dev/null || true)"
    if [[ "$API_COMMAND" == *"$API_BIN"* ]]; then
      echo "stopping stale planet-api process $API_PID"
      kill "$API_PID" 2>/dev/null || true
    fi
  done < <(lsof -nP -tiTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null || true)
  for _ in $(seq 1 20); do
    if ! lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then break; fi
    sleep 0.25
  done
fi

echo "DEVELOPER_DIR=$DEVELOPER_DIR"
echo "xcode-select -> $(/usr/bin/xcode-select -p 2>/dev/null || echo unknown)"
/usr/bin/xcodebuild -version 2>/dev/null | head -2 || true

# API on 8081 (prefer prebuilt binary — avoids GOPROXY issues)
if ! curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/healthz" >/dev/null 2>&1; then
  if [ -x "$API_BIN" ]; then
    echo "starting planet-api on :${API_PORT}"
    (
      cd "$ROOT_DIR/planet-api"
      PLANET_ENV=dev DATABASE_URL="${DATABASE_URL:-postgres:///planet}" \
        BIND="0.0.0.0:${API_PORT}" DEV_AUTH_CODES=1 \
        nohup "$API_BIN" >>"$ROOT_DIR/.dev/backend.log" 2>&1 &
      echo $! >"$ROOT_DIR/.dev/backend.pid"
    )
    sleep 1
  else
    echo "API not running on :${API_PORT} and bin missing: $API_BIN" >&2
    exit 1
  fi
fi

metro_serves_app() {
  local pid
  while read -r pid; do
    [ -n "$pid" ] || continue
    # The native Metro process is often reported as `node ./node_modules/...`
    # without its working directory in the command line. Check the cwd as well
    # so a healthy APP server is not mistaken for a stale Expo server.
    if ps -p "$pid" -o command= 2>/dev/null | grep -q "$APP_DIR" || \
      [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$APP_DIR" ]; then
      return 0
    fi
  done < <(lsof -nP -tiTCP:"$EXPO_PORT" -sTCP:LISTEN 2>/dev/null || true)
  return 1
}

METRO_ALREADY_UP=0
if lsof -nP -tiTCP:"$EXPO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if metro_serves_app; then
    echo "Metro already serving APP on :${EXPO_PORT}"
    METRO_ALREADY_UP=1
  else
    echo "stopping stale process on :${EXPO_PORT}"
    lsof -nP -tiTCP:"$EXPO_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
    sleep 1
  fi
fi

# Prefer the explicitly selected Simulator, otherwise resolve an available
# iPhone by CoreSimulator device type. The override is intentionally a UDID
# (not a device class) so a test cannot accidentally resolve to a physical
# device. Device display names may be changed by acceptance runs.
UDID="${IOS_SIMULATOR_UDID:-}"
if [ -n "$UDID" ]; then
  if ! DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available 2>/dev/null | grep -q "($UDID)"; then
    echo "IOS_SIMULATOR_UDID is not an available iOS Simulator: $UDID" >&2
    exit 1
  fi
else
  UDID="$(
    DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available -j 2>/dev/null \
      | python3 -c '
import json, sys
try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
devices = [device for runtime in payload.get("devices", {}).values() for device in runtime]
preferred = [device for device in devices if device.get("deviceTypeIdentifier", "").endswith("iPhone-17-Pro-Max")]
iphones = [device for device in devices if ".iPhone-" in device.get("deviceTypeIdentifier", "")]
for device in preferred + iphones:
    if device.get("state") == "Booted":
        print(device.get("udid", ""))
        raise SystemExit(0)
for device in preferred + iphones:
    print(device.get("udid", ""))
    raise SystemExit(0)
'
  )"
fi
if [ -n "${UDID:-}" ]; then
  DEVICE_NAME="$({ DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available 2>/dev/null || true; } | sed -n "s/^ *\\(.*\\) ($UDID).*/\\1/p" | head -1)"
  DEVICE_NAME="${DEVICE_NAME:-iPhone Simulator}"
  defaults write com.apple.iphonesimulator CurrentDeviceUDID "$UDID" 2>/dev/null || true
  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl boot "$UDID" 2>/dev/null || true
  export EXPO_IOS_SIMULATOR_DEVICE_NAME="$DEVICE_NAME"
  SIM_APP="$DEVELOPER_DIR/Applications/Simulator.app"
  if [ -d "$SIM_APP" ]; then
    open -a "$SIM_APP" >/dev/null 2>&1 || true
  else
    open -a Simulator >/dev/null 2>&1 || true
  fi
fi

if [ -z "${UDID:-}" ]; then
  echo "No available iPhone Simulator found; refusing to build or install a physical device." >&2
  exit 1
fi

cd "$APP_DIR"

# Unset broken local proxies that break npm/metro
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy SOCKS5_PROXY SOCKS_PROXY || true
export NO_PROXY='*'
export DEVELOPER_DIR
export EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:${API_PORT}/api/v1"

if [ -z "${UDID:-}" ]; then
  echo "No supported iPhone 17 Pro Max simulator is available." >&2
  exit 1
fi

if [ "$METRO_ALREADY_UP" = 0 ]; then
  echo "starting Metro for native PLANET on :${EXPO_PORT}"
  # A plain nohup child is reaped by some desktop task runners when this
  # script exits. Submit Metro to the user's launchd session so it survives
  # the build script and remains available to the native Debug app.
  METRO_LABEL="com.joinplanet.planet-metro-${EXPO_PORT}"
  launchctl remove "$METRO_LABEL" 2>/dev/null || true
  launchctl submit -l "$METRO_LABEL" -- /bin/bash -lc \
    "cd '$APP_DIR' && exec env EXPO_NO_DOTENV=1 DEVELOPER_DIR='$DEVELOPER_DIR' PATH='$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin' EXPO_PUBLIC_API_BASE_URL='$EXPO_PUBLIC_API_BASE_URL' EXPO_PUBLIC_EAS_PROJECT_ID='${EXPO_PUBLIC_EAS_PROJECT_ID:-}' ./node_modules/.bin/expo start --port '$EXPO_PORT' --clear --offline >>'$ROOT_DIR/.dev/frontend.log' 2>&1"
fi

for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${EXPO_PORT}/status" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -fsS --max-time 1 "http://127.0.0.1:${EXPO_PORT}/status" >/dev/null 2>&1; then
  echo "Metro did not become ready on :${EXPO_PORT}; see $ROOT_DIR/.dev/frontend.log" >&2
  exit 1
fi
METRO_PID="$(lsof -nP -tiTCP:"$EXPO_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
# Keep the native Metro state separate from scripts/dev.sh's Web process.
# Both can be alive at once (8082 + 5173); sharing frontend.pid makes Web
# status/restart target the wrong process after an iOS launch.
[ -n "$METRO_PID" ] && echo "$METRO_PID" >"$ROOT_DIR/.dev/metro.pid"
sleep 0.5
if ! kill -0 "$METRO_PID" 2>/dev/null || ! curl -fsS --max-time 1 "http://127.0.0.1:${EXPO_PORT}/status" >/dev/null 2>&1; then
  echo "Metro exited immediately after becoming ready on :${EXPO_PORT}; see $ROOT_DIR/.dev/frontend.log" >&2
  exit 1
fi

echo "building PLANET native Debug app with CocoaPods workspace"
/usr/bin/xcodebuild \
  -workspace "$APP_DIR/ios/PLANET.xcworkspace" \
  -scheme PLANET \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath "$IOS_DERIVED_DATA" \
  -destination "platform=iOS Simulator,id=$UDID" \
  build -quiet

APP_BUNDLE="$IOS_DERIVED_DATA/Build/Products/Debug-iphonesimulator/PLANET.app"
DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl install "$UDID" "$APP_BUNDLE"
# RCTBundleURLProvider expects host:port here. Using exp:// would open Expo Go
# and leave the native Debug target without a JS entry point.
DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl spawn "$UDID" defaults write pet.joinplanet.app RCT_jsLocation "127.0.0.1:${EXPO_PORT}"
echo "launching native PLANET on $DEVICE_NAME Simulator ($UDID)"
DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl launch "$UDID" pet.joinplanet.app
echo "Metro logs: $ROOT_DIR/.dev/frontend.log"
