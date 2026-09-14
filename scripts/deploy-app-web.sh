#!/usr/bin/env bash
# Deploy APP Web while preserving the Vercel monorepo rootDirectory setting.
# Vercel resolves a CLI upload relative to rootDirectory; with rootDirectory=APP,
# deploying from APP would incorrectly look for APP/APP. This script temporarily
# lets the APP directory be the upload root and always restores the project
# setting, including when the build fails.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/APP"
PROJECT="${PLANET_APP_VERCEL_PROJECT:-planet-app}"
restored=0

restore_root_directory() {
  if ((restored == 1)); then return 0; fi
  restored=1
  echo "app-web-deploy: restoring Vercel rootDirectory=APP"
  (cd "$ROOT_DIR" && npx vercel project update "$PROJECT" --root-directory APP --json --yes >/dev/null)
}
trap restore_root_directory EXIT

echo "app-web-deploy: temporarily clearing Vercel rootDirectory for APP upload"
(cd "$ROOT_DIR" && npx vercel project update "$PROJECT" --auto-detect=root-directory --json --yes >/dev/null)

(cd "$APP_DIR" && npx vercel deploy --prod --yes --archive=tgz)
echo "app-web-deploy: production deployment finished"
