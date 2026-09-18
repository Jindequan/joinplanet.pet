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
  (cd "$ROOT_DIR" && npx vercel project update "$PROJECT" --root-directory APP --json >/dev/null)
}
trap restore_root_directory EXIT

echo "app-web-deploy: temporarily clearing Vercel rootDirectory for APP upload"
(cd "$ROOT_DIR" && npx vercel project update "$PROJECT" --auto-detect root-directory --json >/dev/null)

# 2026-09-19 起改为 **prebuilt 流程**：`vercel build` 在本机跑 export:web:production，
# 再上传 .vercel/output。原因：Vercel 远端构建器的 Metro bundler 反复
# 「Error: fetch failed」（远端联网行为不可控），而本机构建已被 e2e/本地 export 验证；
# 在测试所在的同一台机器上构建也更诚实。产物与远端构建等价（同 buildCommand）。
# vercel build 需要本地有项目设置（远端构建时由平台注入）：先 pull 一次
# production 环境（settings + env），再构建。缺少这一步会报
# "No Project Settings found locally"。
echo "app-web-deploy: pulling production project settings"
(cd "$APP_DIR" && npx vercel pull --yes --environment=production)

echo "app-web-deploy: building locally (vercel build, prebuilt flow)"
(cd "$APP_DIR" && npx vercel build --prod)

echo "app-web-deploy: uploading prebuilt output"
(cd "$APP_DIR" && npx vercel deploy --prebuilt --prod --yes)
echo "app-web-deploy: production deployment finished"
