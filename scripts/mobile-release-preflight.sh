#!/usr/bin/env bash
# Validate the configuration required for a real mobile release.
# This script never creates, installs, or uploads anything.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/APP"

fail() {
  echo "mobile-release-preflight: $*" >&2
  exit 1
}

missing=()
for required in \
  EXPO_PUBLIC_EAS_PROJECT_ID \
  PLANET_ANDROID_KEYSTORE \
  PLANET_ANDROID_KEYSTORE_PASSWORD \
  PLANET_ANDROID_KEY_ALIAS \
  PLANET_ANDROID_KEY_PASSWORD; do
  [[ -n "${!required:-}" ]] || missing+=("$required")
done

if ((${#missing[@]})); then
  fail "missing release variables: ${missing[*]}"
fi

project_id="${EXPO_PUBLIC_EAS_PROJECT_ID//[[:space:]]/}"
[[ "$project_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "EXPO_PUBLIC_EAS_PROJECT_ID must be a UUID"

keystore="${PLANET_ANDROID_KEYSTORE/#\~/$HOME}"
[[ -f "$keystore" ]] || fail "PLANET_ANDROID_KEYSTORE does not point to a file"

[[ -f "$APP_DIR/app.json" ]] || fail "APP/app.json is missing"
[[ -f "$APP_DIR/eas.json" ]] || fail "APP/eas.json is missing"

node - "$APP_DIR/app.json" "$APP_DIR/eas.json" "$project_id" <<'NODE'
const fs = require('node:fs')

const [appPath, easPath, projectId] = process.argv.slice(2)
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))
const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'))
const expo = app.expo ?? {}
if (expo.ios?.bundleIdentifier !== 'pet.joinplanet.app') {
  throw new Error('iOS bundle identifier must be pet.joinplanet.app')
}
if (expo.android?.package !== 'pet.joinplanet.app') {
  throw new Error('Android package must be pet.joinplanet.app')
}
if (!eas.build?.production || typeof eas.build.production !== 'object') {
  throw new Error('APP/eas.json must define build.production')
}
if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) {
  throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be a UUID')
}
NODE

echo "mobile-release-preflight: EAS, bundle IDs, production profile, and Android signing inputs passed"
