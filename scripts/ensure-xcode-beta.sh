#!/usr/bin/env bash
# Point Apple tooling at Xcode-beta when stable Xcode.app is absent.
# Source from other scripts:  source "$ROOT/scripts/ensure-xcode-beta.sh"
set -euo pipefail

resolve_developer_dir() {
  if [ -n "${DEVELOPER_DIR:-}" ] && [ -d "$DEVELOPER_DIR" ]; then
    printf '%s' "$DEVELOPER_DIR"
    return 0
  fi
  if [ -d /Applications/Xcode-beta.app/Contents/Developer ]; then
    printf '%s' /Applications/Xcode-beta.app/Contents/Developer
    return 0
  fi
  if [ -d /Applications/Xcode.app/Contents/Developer ]; then
    printf '%s' /Applications/Xcode.app/Contents/Developer
    return 0
  fi
  local selected
  selected="$(/usr/bin/xcode-select -p 2>/dev/null || true)"
  if [ -n "$selected" ] && [ -d "$selected" ]; then
    printf '%s' "$selected"
    return 0
  fi
  return 1
}

if ! DEVELOPER_DIR="$(resolve_developer_dir)"; then
  echo "No Xcode / Xcode-beta Developer directory found." >&2
  echo "Install Xcode-beta, or set DEVELOPER_DIR=/path/to/.../Contents/Developer" >&2
  exit 1
fi

export DEVELOPER_DIR
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

# Prefer DeviceHub UI on Xcode 27+
if [ -d /Applications/Xcode-beta.app/Contents/Applications/DeviceHub.app ]; then
  open /Applications/Xcode-beta.app/Contents/Applications/DeviceHub.app >/dev/null 2>&1 || true
fi
