#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "prod-preflight: $*" >&2
  exit 1
}

[[ "${PLANET_ENV:-}" == "prod" ]] || fail "PLANET_ENV must be prod"
[[ "${DEV_AUTH_CODES:-0}" != "1" ]] || fail "DEV_AUTH_CODES=1 is forbidden in production"
missing=()
for required in DATABASE_URL CORS_ORIGINS BACKUP_DIR BACKUP_S3_URI; do
  [[ -n "${!required:-}" ]] || missing+=("$required")
done
if ((${#missing[@]})); then
  fail "missing required production variables: ${missing[*]}"
fi
# 邮件登录是产品开关（2026-09-18 裁决：生产只支持 Apple 登录）：
# 关闭时不需要邮件服务商；显式开启就必须有 key，否则等于给用户一个收不到验证码的登录入口。
case "${EMAIL_LOGIN:-}" in
  enabled|1|true)
    [[ -n "${RESEND_API_KEY:-}" ]] || fail "EMAIL_LOGIN=enabled requires RESEND_API_KEY"
    ;;
  ''|disabled|0|false) ;;
  *) fail "EMAIL_LOGIN must be enabled or disabled (got ${EMAIL_LOGIN})" ;;
esac
[[ "${BASE_URL:-}" == https://* ]] || fail "BASE_URL must be an https URL"
IFS=',' read -r -a cors_origins <<< "$CORS_ORIGINS"
for origin in "${cors_origins[@]}"; do
  origin="${origin#"${origin%%[![:space:]]*}"}"
  origin="${origin%"${origin##*[![:space:]]}"}"
  case "$origin" in
    https://*) ;;
    *) fail "CORS_ORIGINS must contain explicit https origins without wildcards or paths" ;;
  esac
  cors_host="${origin#https://}"
  case "$cors_host" in
    *\**|*/*|"") fail "CORS_ORIGINS must contain explicit https origins without wildcards or paths" ;;
  esac
done
for required_origin in https://www.joinplanet.pet https://app.joinplanet.pet; do
  found=0
  for origin in "${cors_origins[@]}"; do
    origin="${origin#"${origin%%[![:space:]]*}"}"
    origin="${origin%"${origin##*[![:space:]]}"}"
    if [[ "$origin" == "$required_origin" ]]; then
      found=1
      break
    fi
  done
  ((found == 1)) || fail "CORS_ORIGINS must include $required_origin"
done
bind_addr="${BIND:-127.0.0.1:8081}"
case "$bind_addr" in
  127.0.0.1:*|\[::1\]:*) ;;
  *) fail "BIND must use loopback in production (got $bind_addr); put the public TLS proxy in front" ;;
esac

command -v pg_dump >/dev/null || fail "pg_dump is required for backup verification"
command -v pg_restore >/dev/null || fail "pg_restore is required for backup verification"
command -v aws >/dev/null || fail "aws CLI is required for off-site backup verification"

echo "prod-preflight: configuration and backup prerequisites passed"
echo "prod-preflight: next run planet-cli migrate status and planet-cli backup before deploy"
