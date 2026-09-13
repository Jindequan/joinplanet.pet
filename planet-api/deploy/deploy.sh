#!/usr/bin/env bash
# planet-api 部署脚本（在仓库根目录构建后于服务器执行）
# 顺序固定：准备二进制/反代 → 迁移（owner 角色）→ 授权 → 重启服务 → 健康门 → 失败回滚。
# 注意：迁移是 forward-only；回滚只恢复二进制，schema 保持已迁移状态
#（迁移策略只允许加列/加表，旧二进制对新增 schema 天然兼容）。
set -euo pipefail

REMOTE_HOST="${1:?usage: deploy.sh user@host}"

for arch in amd64 arm64; do
  CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -o "bin/planet-api-linux-$arch" ./cmd/planet-api
  CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -o "bin/planet-cli-linux-$arch" ./cmd/planet-cli
done

rsync -av bin/planet-api-linux-amd64 bin/planet-api-linux-arm64 \
  bin/planet-cli-linux-amd64 bin/planet-cli-linux-arm64 "$REMOTE_HOST:/tmp/"
rsync -av deploy/planet-api.service "$REMOTE_HOST:/tmp/"
rsync -av deploy/Caddyfile "$REMOTE_HOST:/tmp/planet-api.Caddyfile"

ssh "$REMOTE_HOST" bash -s <<'EOF'
set -euo pipefail
# 迁移凭据只从 owner 专用文件加载（0600 root:root）；应用进程的
# EnvironmentFile（/etc/planet-api.env）不持有 DDL 密码。
. /etc/planet-api-owner.env
OWNER_DSN="host=/var/run/postgresql dbname=planet user=planet_owner password=$PLANET_OWNER_PASSWORD"

case "$(uname -m)" in
  x86_64|amd64) ARCH_SUFFIX=amd64 ;;
  aarch64|arm64) ARCH_SUFFIX=arm64 ;;
  *) echo "unsupported server architecture: $(uname -m)" >&2; exit 1 ;;
esac

# 0. 备份当前二进制（健康门失败时回滚用）
if [ -f /opt/planet-api/bin/planet-api ]; then
  cp -a /opt/planet-api/bin/planet-api /opt/planet-api/bin/planet-api.prev
fi

install -m 0755 "/tmp/planet-api-linux-$ARCH_SUFFIX" /opt/planet-api/bin/planet-api
install -m 0755 "/tmp/planet-cli-linux-$ARCH_SUFFIX" /opt/planet-api/bin/planet-cli
install -m 0644 /tmp/planet-api.service /etc/systemd/system/planet-api.service
systemctl daemon-reload

# 0.5 Caddy 路由也必须切到当前双后端分流配置。旧的 landing backend 曾占用同一域名并返回
# /healthz=200、/api/v1=404；只替换二进制而不更新反代会造成“健康但无法登录”。
# 新配置只把 /api/v1、/healthz、/readyz 送到 8081，其余 Landing 支付路径仍送到 8080。
# 先备份现有配置，验证失败或健康门失败时恢复。
CADDY_CONFIG=/etc/caddy/Caddyfile
CADDY_BACKUP=/etc/caddy/Caddyfile.planet-api.prev
if ! command -v caddy >/dev/null 2>&1; then
  echo "caddy is required to route api.joinplanet.pet to planet-api" >&2
  exit 1
fi
if [ -f "$CADDY_CONFIG" ]; then
  cp -a "$CADDY_CONFIG" "$CADDY_BACKUP"
fi
install -d -m 0755 /etc/caddy
if [ ! -f "$CADDY_CONFIG" ]; then
  install -m 0644 /tmp/planet-api.Caddyfile "$CADDY_CONFIG"
else
  python3 - "$CADDY_CONFIG" /tmp/planet-api.Caddyfile <<'PY'
from pathlib import Path
import re
import sys

target = Path(sys.argv[1])
fragment = Path(sys.argv[2]).read_text(encoding="utf-8").strip()
text = target.read_text(encoding="utf-8")
match = re.search(r"(?m)^[ \t]*api\.joinplanet\.pet[ \t]*\{", text)
if match is None:
    suffix = "\n" if text.endswith("\n") else "\n\n"
    target.write_text(text.rstrip() + suffix + "\n" + fragment + "\n", encoding="utf-8")
    raise SystemExit(0)

start = match.start()
open_brace = match.end() - 1
depth = 0
quoted = False
escaped = False
close_brace = -1
for index in range(open_brace, len(text)):
    char = text[index]
    if quoted:
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == '"':
            quoted = False
        continue
    if char == '"':
        quoted = True
    elif char == "{":
        depth += 1
    elif char == "}":
        depth -= 1
        if depth == 0:
            close_brace = index + 1
            break
if close_brace < 0:
    raise SystemExit("api.joinplanet.pet block has no closing brace")

line_start = text.rfind("\n", 0, start) + 1
target.write_text(text[:line_start] + fragment + text[close_brace:], encoding="utf-8")
PY
fi
reload_caddy() {
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
}
restore_caddy() {
  if [ -f "$CADDY_BACKUP" ]; then
    cp -a "$CADDY_BACKUP" "$CADDY_CONFIG"
    caddy validate --config "$CADDY_CONFIG" >/dev/null
    reload_caddy
  fi
}
if ! caddy validate --config "$CADDY_CONFIG"; then
  restore_caddy
  exit 1
fi
if ! reload_caddy; then
  restore_caddy
  exit 1
fi

# 1. 迁移（owner 角色，失败即停止，不重启服务）
/opt/planet-api/bin/planet-cli migrate up --url "$OWNER_DSN"

# 1.5 授权：迁移可能新建业务表，须让 planet_app 立即拿到 DML/sequence 权限。
# 以 planet_owner 身份执行：owner 可授权自己的表，且可为自己设定 DEFAULT PRIVILEGES
#（使未来迁移新建的表自动授权给 planet_app，无需再次手动 GRANT）。
psql "$OWNER_DSN" -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO planet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO planet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE planet_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO planet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE planet_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO planet_app;

-- 最小权限：计费/配额定义表对运行时角色收权。plans/quota_configs 只读
--（限额变更走 planet-cli + owner 角色）；entitlements 只读（授权是 CLI/
-- 管理路径）；subscriptions 允许 INSERT（注册即订阅 free）但禁止改删
--（升降档走 owner 角色的管理操作）。应用层被打穿时无法自改配额。
REVOKE INSERT, UPDATE, DELETE ON plans, quota_configs, entitlements FROM planet_app;
REVOKE UPDATE, DELETE ON subscriptions FROM planet_app;
SQL

# 2. 重启 + 健康门 + 登录路由门（任一失败都回滚二进制）
verify_login_route() {
  local headers body code allow
  headers="$(mktemp)"
  body="$(mktemp)"
  code="$(curl --silent --show-error --max-time 10 --output "$body" \
    --dump-header "$headers" --write-out '%{http_code}' \
    --request POST http://127.0.0.1:8081/api/v1/auth/request-code \
    --header 'Origin: https://app.joinplanet.pet' \
    --header 'Content-Type: application/json' --data '{"email":""}' || true)"
  allow="$(awk 'BEGIN { IGNORECASE=1 } /^Access-Control-Allow-Origin:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/[\r\n]/, ""); print; exit }' "$headers")"
  local valid=0
  if [[ "$code" == 400 && "$allow" == 'https://app.joinplanet.pet' ]] && \
    grep -q '"code"[[:space:]]*:[[:space:]]*"VALIDATION_FAILED"' "$body"; then
    valid=1
  fi
  rm -f "$headers" "$body"
  ((valid == 1))
}

systemctl restart planet-api
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8081/readyz >/dev/null; then
    if verify_login_route; then echo "READY (health + auth route + CORS)"; exit 0; fi
    echo "auth route/CORS not ready (attempt $i/20)" >&2
  fi
  sleep 1
done
echo "readyz or auth route/CORS failed after restart" >&2
journalctl -u planet-api -n 50 --no-pager >&2
if [ -f /opt/planet-api/bin/planet-api.prev ]; then
  echo "rolling back to previous binary" >&2
  cp -a /opt/planet-api/bin/planet-api.prev /opt/planet-api/bin/planet-api
  systemctl restart planet-api
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:8081/readyz >/dev/null; then
      echo "ROLLED BACK (ready)"
      restore_caddy
      exit 1
    fi
    sleep 1
  done
fi
restore_caddy
exit 1
EOF
