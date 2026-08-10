#!/usr/bin/env bash
# PLANET backend one-shot deploy script.
# Run ON the server (43.130.6.237) as root AFTER uploading this file + the binary + schema.sql.
#
# Usage:
#   scp planet-backend schema.sql deploy.sh root@43.130.6.237:/root/
#   ssh root@43.130.6.237 'bash /root/deploy.sh'
#
# Idempotent: safe to re-run. It will NOT clobber an existing .env.

set -euo pipefail

INSTALL_DIR="/opt/planet-backend"
BINARY_NAME="planet-backend"

echo "=== PLANET backend deploy ==="

# 1. Detect architecture and pick the right binary if both were uploaded.
ARCH=$(uname -m)
echo "Architecture: $ARCH"
SRC_BIN="/root/planet-backend-amd64"
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  SRC_BIN="/root/planet-backend-arm64"
fi
if [ ! -f "$SRC_BIN" ]; then
  SRC_BIN="/root/planet-backend"
fi
if [ ! -f "$SRC_BIN" ]; then
  echo "ERROR: binary not found. Upload planet-backend (or -amd64/-arm64) to /root/ first."
  exit 1
fi

# 2. PostgreSQL: create database + dedicated user (idempotent).
echo "=== PostgreSQL setup ==="
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install PostgreSQL first."
  exit 1
fi

# Use sudo -u postgres to run SQL as the superuser.
# createuser/db creation are tolerant of "already exists" via DO blocks.
sudo -u postgres psql -v ON_ERROR_STOP=0 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'planet') THEN
    CREATE ROLE planet WITH LOGIN PASSWORD 'CHANGE_THIS_PASSWORD';
  END IF;
END
$$;
SQL

# Create the database if it doesn't exist (can't IF NOT EXISTS in CREATE DATABASE directly).
if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw planet; then
  sudo -u postgres createdb -O planet planet
  echo "Created database 'planet' owned by 'planet'."
else
  echo "Database 'planet' already exists."
fi

# Grant privileges.
sudo -u postgres psql -d planet -c "GRANT ALL PRIVILEGES ON DATABASE planet TO planet;" >/dev/null

# 3. Run schema.sql (idempotent — all CREATE TABLE IF NOT EXISTS).
echo "=== Applying schema ==="
PGPASSWORD='CHANGE_THIS_PASSWORD' psql -h 127.0.0.1 -U planet -d planet -f /root/schema.sql 2>&1 | tail -5 || true

# 4. Install directory + binary.
echo "=== Installing binary ==="
mkdir -p "$INSTALL_DIR"
cp "$SRC_BIN" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

# 5. .env — create if missing, never overwrite.
echo "=== .env ==="
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cat > "$INSTALL_DIR/.env" <<'ENV'
DATABASE_URL=postgres://planet:CHANGE_THIS_PASSWORD@127.0.0.1:5432/planet?sslmode=disable
PORT=8080
CORS_ORIGIN=https://www.joinplanet.pet
MAX_MEMBERSHIPS=100

LEMON_PRODUCT_ID=1278282
LEMON_FOUNDING_20_CHECKOUT_URL=
LEMON_FOUNDING_20_VARIANT_ID=1998458
LEMON_EARLY_60_CHECKOUT_URL=
LEMON_EARLY_60_VARIANT_ID=1998459
LEMON_FINAL_100_CHECKOUT_URL=
LEMON_FINAL_100_VARIANT_ID=1998460

LEMON_STORE_ID=
LEMON_API_KEY=
LEMON_CHECKOUT_REDIRECT_URL=https://www.joinplanet.pet/success
LEMON_TEST_MODE=false

LEMON_SQUEEZY_SIGNING_SECRET=
PLANET_CLAIM_TOKEN=
ENV
  echo "Created $INSTALL_DIR/.env — REMEMBER TO EDIT IT (password, secrets, store id)."
else
  echo ".env already exists, skipped (edit manually if needed)."
fi

# 6. systemd service.
echo "=== systemd service ==="
cat > /etc/systemd/system/planet-backend.service <<UNIT
[Unit]
Description=PLANET backend (Go + PostgreSQL)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/$BINARY_NAME
EnvironmentFile=$INSTALL_DIR/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable planet-backend >/dev/null 2>&1 || true
systemctl restart planet-backend
sleep 2
if systemctl is-active --quiet planet-backend; then
  echo "✓ planet-backend is running."
else
  echo "✗ planet-backend failed to start. Check: journalctl -u planet-backend -n 30"
  exit 1
fi

# 7. Local health check (before Caddy).
echo "=== Health check (localhost) ==="
curl -sf http://localhost:8080/healthz && echo "" || echo "(healthz not responding yet — check .env DATABASE_URL)"

# 8. Caddy reverse proxy (if Caddy is installed).
echo "=== Caddy ==="
if command -v caddy >/dev/null 2>&1; then
  if [ -f /etc/caddy/Caddyfile ]; then
    if grep -q "api.joinplanet.pet" /etc/caddy/Caddyfile; then
      echo "api.joinplanet.pet already in Caddyfile."
    else
      cat >> /etc/caddy/Caddyfile <<'CADDY'

api.joinplanet.pet {
  reverse_proxy 127.0.0.1:8080
}
CADDY
      echo "Added api.joinplanet.pet block to Caddyfile."
    fi
    systemctl reload caddy 2>/dev/null || systemctl restart caddy
    echo "✓ Caddy reloaded. HTTPS will be ready once DNS for api.joinplanet.pet points here."
  else
    echo "api.joinplanet.pet {
  reverse_proxy 127.0.0.1:8080
}" > /etc/caddy/Caddyfile
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy
    echo "✓ Created Caddyfile + restarted Caddy."
  fi
else
  echo "Caddy not installed. Install it: https://caddyserver.com/docs/install"
  echo "Then add this to /etc/caddy/Caddyfile:"
  echo "  api.joinplanet.pet { reverse_proxy 127.0.0.1:8080 }"
fi

echo ""
echo "=== DONE ==="
echo "Next steps:"
echo "  1. EDIT $INSTALL_DIR/.env — set the real PG password + Lemon secrets + LEMON_STORE_ID"
echo "  2. systemctl restart planet-backend"
echo "  3. Point DNS: api.joinplanet.pet A record -> this server IP"
echo "  4. Verify: curl https://api.joinplanet.pet/healthz"
echo "  5. In Lemon Squeezy: add webhook https://api.joinplanet.pet/webhook (filter by product 1278282)"
