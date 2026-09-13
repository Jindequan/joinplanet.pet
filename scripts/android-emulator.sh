#!/usr/bin/env bash
# Launch PLANET only on an Android Emulator. Never fall back to a physical
# Android device when one happens to be connected to the host.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/APP"
EXPO_PORT="${EXPO_PORT:-8082}"
API_PORT="${API_PORT:-8081}"
ADB_TIMEOUT_SECS="${ADB_TIMEOUT_SECS:-15}"

# Keep the command self-contained on macOS: Android Studio installs adb under
# the SDK directory, but many shells do not add platform-tools to PATH.
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$ANDROID_SDK_ROOT" ] && [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
  ANDROID_SDK_ROOT="/opt/homebrew/share/android-commandlinetools"
fi
if [ -n "$ANDROID_SDK_ROOT" ]; then
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
  export ANDROID_SDK_ROOT
fi
if [ -n "$ANDROID_SDK_ROOT" ] && [ -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
  export PATH="$ANDROID_SDK_ROOT/platform-tools:$PATH"
fi
if ! java -version >/dev/null 2>&1; then
  for java_home in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"; do
    if [ -x "$java_home/bin/java" ]; then
      export JAVA_HOME="$java_home"
      export PATH="$JAVA_HOME/bin:$PATH"
      break
    fi
  done
fi

adb_with_timeout() {
  if command -v perl >/dev/null 2>&1; then
    perl -e 'alarm shift; exec @ARGV' "$ADB_TIMEOUT_SECS" adb "$@"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$ADB_TIMEOUT_SECS" "$@" <<'PY'
import os
import signal
import subprocess
import sys

timeout = int(sys.argv[1])
args = sys.argv[2:]
try:
    completed = subprocess.run(["adb", *args], check=False, timeout=timeout)
except subprocess.TimeoutExpired:
    print(f"adb timed out after {timeout}s", file=sys.stderr)
    raise SystemExit(124)
raise SystemExit(completed.returncode)
PY
  else
    adb "$@"
  fi
}

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is unavailable; refusing to launch on an Android device." >&2
  exit 1
fi

if ! DEVICE_LIST="$(adb_with_timeout devices 2>&1)"; then
  echo "adb did not respond within ${ADB_TIMEOUT_SECS}s; refusing to launch any device." >&2
  exit 1
fi

SERIAL="$(printf '%s\n' "$DEVICE_LIST" | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
if [ -z "${SERIAL:-}" ]; then
  echo "No running Android Emulator found; refusing to launch on a physical device." >&2
  exit 1
fi
AVD_NAME="$(adb_with_timeout -s "$SERIAL" emu avd name 2>/dev/null | sed -n '1p' | tr -d '\r')"
if [ -z "${AVD_NAME:-}" ] || [ "$AVD_NAME" = "OK" ]; then
  echo "Could not resolve the AVD name for ${SERIAL}; refusing to launch an unverified Android target." >&2
  exit 1
fi

if [ ! -x "$ROOT_DIR/APP/android/gradlew" ]; then
  echo "Android native project is missing; refusing to use Expo Go as a product substitute." >&2
  exit 1
fi

if ! java -version >/dev/null 2>&1; then
  echo "A Java runtime is required to build the Android app; refusing to fall back to Expo Go." >&2
  exit 1
fi

# Native Android resolves 127.0.0.1 inside the Emulator. Keep the app's
# normal local API URL, but explicitly reverse that port to the host. Start
# the managed backend when it is not already healthy so `npm run android` is
# a complete local flow instead of a UI-only launch.
if ! curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/healthz" >/dev/null 2>&1; then
  echo "API is not ready on :${API_PORT}; starting the managed local backend"
  API_PORT="$API_PORT" "$ROOT_DIR/scripts/dev.sh" start backend
fi
if ! curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/healthz" >/dev/null 2>&1; then
  echo "API did not become ready on :${API_PORT}; refusing to launch an offline Android client." >&2
  exit 1
fi
if ! adb_with_timeout -s "$SERIAL" reverse "tcp:${API_PORT}" "tcp:${API_PORT}" >/dev/null; then
  echo "Could not reverse API port ${API_PORT} to Android Emulator ${SERIAL}; refusing to launch with a misleading offline state." >&2
  exit 1
fi
if ! adb_with_timeout -s "$SERIAL" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null; then
  echo "Could not reverse Metro port ${EXPO_PORT} to Android Emulator ${SERIAL}; refusing to launch without a JS bundle path." >&2
  exit 1
fi

export ANDROID_SERIAL="$SERIAL"
cd "$APP_DIR"
export EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:${API_PORT}/api/v1"
export EXPO_PACKAGER_PROXY_URL="http://127.0.0.1:${EXPO_PORT}"

# Expo's native run command starts a child Metro process that may reload dotenv
# files after this shell has exported its environment. Keep custom ports
# deterministic by providing a temporary .env.local with the same values, then
# restore the developer's file when the command exits or is interrupted.
ENV_LOCAL="$APP_DIR/.env.local"
ENV_LOCAL_BACKUP="$(mktemp "${TMPDIR:-/tmp}/planet-env-local.XXXXXX")"
ENV_LOCAL_EXISTED=0
if [ -e "$ENV_LOCAL" ]; then
  cp "$ENV_LOCAL" "$ENV_LOCAL_BACKUP"
  ENV_LOCAL_EXISTED=1
fi
cleanup_env_local() {
  if [ "$ENV_LOCAL_EXISTED" -eq 1 ]; then
    cp "$ENV_LOCAL_BACKUP" "$ENV_LOCAL"
  else
    rm -f "$ENV_LOCAL"
  fi
  rm -f "$ENV_LOCAL_BACKUP"
}
on_signal() {
  cleanup_env_local
  exit "$1"
}
trap cleanup_env_local EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM
cat > "$ENV_LOCAL" <<EOF
EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL
EXPO_PACKAGER_PROXY_URL=$EXPO_PACKAGER_PROXY_URL
EOF

env EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_BASE_URL="$EXPO_PUBLIC_API_BASE_URL" EXPO_PACKAGER_PROXY_URL="$EXPO_PACKAGER_PROXY_URL" npx expo run:android --device "$AVD_NAME" --port "$EXPO_PORT"
