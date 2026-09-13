#!/usr/bin/env bash
# Compatibility entry point for the current PLANET Web app.
# The old Vite/mobile-v3 launcher is intentionally gone: Web and native now
# use APP/ so local testing cannot silently switch to a different product.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_CONTROLLER="$ROOT_DIR/scripts/dev.sh"

usage() {
  cat <<'EOF'
Usage: scripts/planet-app.sh {start|stop|restart|status|logs} [backend|frontend]

The Web app runs from APP/ at http://127.0.0.1:5173.
Equivalent direct command: scripts/dev.sh start all web
EOF
}

action="${1:-status}"
target="${2:-all}"
case "$action:$target" in
  start:all) exec "$DEV_CONTROLLER" start all web ;;
  start:backend) exec "$DEV_CONTROLLER" start backend ;;
  start:frontend) exec "$DEV_CONTROLLER" start frontend web ;;
  stop:all) exec "$DEV_CONTROLLER" stop all ;;
  stop:backend) exec "$DEV_CONTROLLER" stop backend ;;
  stop:frontend) exec "$DEV_CONTROLLER" stop frontend ;;
  restart:all) exec "$DEV_CONTROLLER" restart all web ;;
  restart:backend) exec "$DEV_CONTROLLER" restart backend ;;
  restart:frontend) exec "$DEV_CONTROLLER" restart frontend web ;;
  status:all) exec "$DEV_CONTROLLER" status ;;
  logs:backend) exec "$DEV_CONTROLLER" logs backend ;;
  logs:frontend) exec "$DEV_CONTROLLER" logs frontend ;;
  *) usage; exit 2 ;;
esac
