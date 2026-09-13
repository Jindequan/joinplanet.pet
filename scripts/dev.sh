#!/usr/bin/env bash
# PLANET local development process manager.
#
#   scripts/dev.sh start all web
#   scripts/dev.sh start all simulator
#   scripts/dev.sh start backend
#   scripts/dev.sh restart frontend simulator
#   scripts/dev.sh status
#   scripts/dev.sh logs frontend
#   scripts/dev.sh stop all
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Prefer Xcode-beta when present (Expo hardcodes Xcode.app otherwise).
# shellcheck source=ensure-xcode-beta.sh
source "$ROOT_DIR/scripts/ensure-xcode-beta.sh" || true
STATE_DIR="${DEV_STATE_DIR:-$ROOT_DIR/.dev}"
API_PORT="${API_PORT:-8081}"
EXPO_PORT="${EXPO_PORT:-8082}"
WEB_PORT="${WEB_PORT:-5173}"
APP_DIR="$ROOT_DIR/APP"
API_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
FRONTEND_MODE_FILE="$STATE_DIR/frontend.mode"
BACKEND_LOG="$STATE_DIR/backend.log"
FRONTEND_LOG="$STATE_DIR/frontend.log"
mkdir -p "$STATE_DIR"

detect_lan_ip() {
  local interface_name address
  interface_name="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  for interface_name in "$interface_name" en0 en1 en2; do
    [ -n "$interface_name" ] || continue
    address="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
    if [ -n "$address" ]; then printf '%s' "$address"; return; fi
  done
}

pid_from_file() { local pid=""; [ -f "$1" ] && read -r pid < "$1" || true; printf '%s' "$pid"; }
pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
write_pid() { printf '%s\n' "$2" > "$1"; }
port_pids() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
api_health() { curl -fsS --max-time 2 "http://127.0.0.1:${API_PORT}/healthz" >/dev/null 2>&1; }

dev_migrate() {
  local database_url="$1"
  echo "backend: applying local migrations"
  (cd "$ROOT_DIR/planet-api" && go run ./cmd/planet-cli migrate up --url "$database_url")
}

is_dev_process() {
  local pid="$1" kind="${2:-}" command parent
  while [ -n "$pid" ] && [ "$pid" != 1 ]; do
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$kind" in
      backend)
        [[ "$command" == *"planet-api"* ]] && return 0
        ;;
      frontend)
        [[ "$command" == *"expo start"* && "$command" == *"$APP_DIR"* ]] && return 0
        [[ "$command" == *"npm exec expo start"* ]] && return 0
        ;;
    esac
    parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    [ "$parent" = "$pid" ] && break
    pid="$parent"
  done
  return 1
}

kill_tree() {
  local pid="$1" child
  [ -n "$pid" ] || return 0
  while read -r child; do [ -n "$child" ] && kill_tree "$child"; done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

wait_for_api() {
  local _
  for _ in $(seq 1 80); do api_health && return 0; sleep 0.25; done
  return 1
}

wait_for_port() {
  local port="$1" _
  for _ in $(seq 1 80); do [ -n "$(port_pids "$port")" ] && return 0; sleep 0.25; done
  return 1
}

start_backend() {
  local pid lan_ip cors_origins database_url
  pid="$(pid_from_file "$API_PID_FILE")"
  if api_health; then echo "backend: UP on :${API_PORT}${pid:+ (pid $pid)}"; return 0; fi
  if pid_alive "$pid"; then echo "backend: pid $pid is running but unhealthy; see $BACKEND_LOG"; return 1; fi
  echo "backend: starting on 0.0.0.0:${API_PORT}"
  database_url="${DATABASE_URL:-postgres:///planet}"
  dev_migrate "$database_url"
  lan_ip="${LAN_IP:-$(detect_lan_ip)}"
  # Expo/Metro uses EXPO_PORT, while the in-app Web test server commonly uses
  # 5173. Keep both browser origins allowed or a backend restart will look like
  # a network outage: requests reach the API but the browser blocks responses.
  cors_origins="${CORS_ORIGINS:-http://localhost:${EXPO_PORT},http://127.0.0.1:${EXPO_PORT},http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}}"
  if [ -n "$lan_ip" ]; then cors_origins="${cors_origins},http://${lan_ip}:${EXPO_PORT}"; fi
  # shellcheck disable=SC2016
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "$database_url" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  elif command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die $!;' -- \
      bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "$database_url" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  else
    nohup bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "$database_url" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  fi
  pid=$!; write_pid "$API_PID_FILE" "$pid"
  if wait_for_api; then echo "backend: ready (pid $pid), log $BACKEND_LOG"; else echo "backend: failed; see $BACKEND_LOG"; return 1; fi
}

start_frontend() {
  local mode="${1:-simulator}" api_host api_origin api_base_url pid expo_args frontend_port existing_mode
  case "$mode" in
    simulator)
      # The iOS Simulator reaches services on the Mac through loopback. Keep
      # this mode local so it cannot accidentally expose a QR session for a
      # physical phone.
      api_host="127.0.0.1"
      frontend_port="$EXPO_PORT"
      expo_args=(--localhost)
      ;;
    web)
      # Web runs in this Mac's browser. Keep its API URL loopback-local so the
      # browser does not depend on the current Wi-Fi interface or Expo's LAN
      # host discovery.
      api_host="127.0.0.1"
      frontend_port="$WEB_PORT"
      expo_args=(--web --offline)
      ;;
    device)
      echo "frontend: physical-device mode is disabled; use simulator or web" >&2
      return 2
      ;;
    *) echo "frontend: mode must be simulator or web"; return 2 ;;
  esac
  api_origin="http://${api_host}:${API_PORT}"
  api_base_url="${api_origin}/api/v1"
  pid="$(pid_from_file "$FRONTEND_PID_FILE")"
  existing_mode="$(cat "$FRONTEND_MODE_FILE" 2>/dev/null || true)"
  if pid_alive "$pid"; then
    if [ "$existing_mode" = "$mode" ]; then
      echo "frontend: UP (pid $pid, mode $mode)"
      return 0
    fi
    echo "frontend: switching from ${existing_mode:-unknown} to $mode"
    stop_service frontend
    pid=""
  fi
  if ! curl -fsS --max-time 2 "${api_origin}/healthz" >/dev/null 2>&1; then echo "frontend: API unavailable at ${api_origin}; start backend first"; return 1; fi
  if [ -n "$(port_pids "$frontend_port")" ]; then
    echo "frontend: port ${frontend_port} is already occupied by an unmanaged process; stop it or choose another port"
    return 1
  fi
  echo "frontend: starting Expo ${mode} on :${frontend_port} (API ${api_base_url})"
  # shellcheck disable=SC2016
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash -c 'cd "$1" && exec env DEVELOPER_DIR="$4" EXPO_PUBLIC_API_BASE_URL="$2" EXPO_PUBLIC_EAS_PROJECT_ID="$5" npx expo start "${@:6}"' \
      bash "$APP_DIR" "$api_base_url" "$frontend_port" "${DEVELOPER_DIR:-}" "${EXPO_PUBLIC_EAS_PROJECT_ID:-}" "${expo_args[@]}" --port "$frontend_port" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  elif command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die $!;' -- \
      bash -c 'cd "$1" && exec env DEVELOPER_DIR="$4" EXPO_PUBLIC_API_BASE_URL="$2" EXPO_PUBLIC_EAS_PROJECT_ID="$5" npx expo start "${@:6}"' \
      bash "$APP_DIR" "$api_base_url" "$frontend_port" "${DEVELOPER_DIR:-}" "${EXPO_PUBLIC_EAS_PROJECT_ID:-}" "${expo_args[@]}" --port "$frontend_port" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  else
    nohup bash -c 'cd "$1" && exec env DEVELOPER_DIR="$4" EXPO_PUBLIC_API_BASE_URL="$2" EXPO_PUBLIC_EAS_PROJECT_ID="$5" npx expo start "${@:6}"' \
      bash "$APP_DIR" "$api_base_url" "$frontend_port" "${DEVELOPER_DIR:-}" "${EXPO_PUBLIC_EAS_PROJECT_ID:-}" "${expo_args[@]}" --port "$frontend_port" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  fi
  pid=$!; write_pid "$FRONTEND_PID_FILE" "$pid"; printf '%s\n' "$mode" > "$FRONTEND_MODE_FILE"
  if wait_for_port "$frontend_port"; then
    echo "frontend: ready (pid $pid), log $FRONTEND_LOG"
    if [ "$mode" = web ]; then
      echo "frontend: Web URL http://127.0.0.1:${frontend_port}"
    else
      echo "frontend: local Metro http://${api_host}:${frontend_port} (open the native app with ./scripts/ios.sh)"
    fi
  else
    echo "frontend: not ready; see $FRONTEND_LOG"
    return 1
  fi
}

stop_service() {
  local service="$1" file pid port kind port_pid frontend_mode
  case "$service" in backend) file="$API_PID_FILE" ;; frontend) file="$FRONTEND_PID_FILE" ;; *) echo "service must be backend or frontend"; return 2 ;; esac
  if [ "$service" = backend ]; then
    port="$API_PORT"
    kind=backend
  else
    frontend_mode="$(cat "$FRONTEND_MODE_FILE" 2>/dev/null || true)"
    port="$EXPO_PORT"
    [ "$frontend_mode" = web ] && port="$WEB_PORT"
    kind=frontend
  fi
  pid="$(pid_from_file "$file")"
  if pid_alive "$pid" && is_dev_process "$pid" "$kind"; then
    echo "$service: stopping pid $pid"
    kill_tree "$pid"
  elif pid_alive "$pid"; then
    echo "$service: stale pid file ignored (pid $pid is not a PLANET process)"
  else
    echo "$service: no managed process"
  fi
  if ! pid_alive "$pid"; then
    while read -r port_pid; do
      if [ -n "$port_pid" ] && is_dev_process "$port_pid" "$kind"; then
        echo "$service: stopping existing dev process on :${port} (pid $port_pid)"
        kill_tree "$port_pid"
      fi
    done < <(
      port_pids "$port"
      if [ "$kind" = frontend ]; then
        pgrep -f "$APP_DIR/node_modules/.bin/expo start" 2>/dev/null || true
        pgrep -f "npm exec expo start.*--port ${EXPO_PORT}" 2>/dev/null || true
      else
        pgrep -f "go run ./cmd/planet-api" 2>/dev/null || true
      fi
    )
  fi
  rm -f "$file"
  if [ "$service" = frontend ]; then rm -f "$FRONTEND_MODE_FILE"; fi
}

status_service() {
  case "$1" in
    backend) if api_health; then echo "backend: UP on :${API_PORT} (managed pid $(pid_from_file "$API_PID_FILE" || true))"; else echo "backend: DOWN on :${API_PORT}"; fi ;;
    frontend)
      local pid mode frontend_port
      pid="$(pid_from_file "$FRONTEND_PID_FILE")"
      mode="$(cat "$FRONTEND_MODE_FILE" 2>/dev/null || echo unknown)"
      frontend_port="$EXPO_PORT"
      [ "$mode" = web ] && frontend_port="$WEB_PORT"
      if [ -n "$(port_pids "$frontend_port")" ]; then
        echo "frontend: UP on :${frontend_port} (mode $mode, managed pid ${pid:-none})"
      else
        echo "frontend: DOWN on :${frontend_port}"
      fi
      ;;
  esac
}

logs_service() {
  case "$1" in backend) exec tail -n 80 -f "$BACKEND_LOG" ;; frontend) exec tail -n 80 -f "$FRONTEND_LOG" ;; *) echo "logs target must be backend or frontend"; return 2 ;; esac
}

reload_app() {
  local port="${EXPO_PORT:-8082}"
  if ! curl -fsS --max-time 2 -X POST "http://127.0.0.1:${port}/reload" >/dev/null 2>&1; then
    echo "frontend: reload failed (is Metro running on :${port}?)"
    return 1
  fi
  echo "frontend: reloaded Expo clients on :${port}"
}

usage() {
  cat <<'EOF'
PLANET dev controller
  scripts/dev.sh start|stop|restart backend|frontend|all [web|simulator]
  scripts/dev.sh ios                 # open APP in iOS Simulator (Xcode-beta)
  scripts/dev.sh reload              # push reload to connected Expo clients
  scripts/dev.sh status
  scripts/dev.sh logs backend|frontend

Environment: API_PORT=8081 EXPO_PORT=8082 WEB_PORT=5173 LAN_IP=192.168.x.x DEV_STATE_DIR=/tmp/planet-dev
EOF
}

action="${1:-status}"; target="${2:-}"; mode="${3:-simulator}"
case "$action:$target" in
  backend:start|backend:stop|backend:restart|frontend:start|frontend:stop|frontend:restart|all:start|all:stop|all:restart)
    mode="${3:-simulator}"
    old_action="$action"; action="$target"; target="$old_action"
    ;;
esac
case "$action:$target" in
  start:backend) start_backend ;; start:frontend) start_frontend "$mode" ;; start:all)
    start_backend && start_frontend "$mode"
    echo "iOS: run ./scripts/ios.sh (or ./scripts/dev.sh ios) to open the Simulator"
    ;;
  ios:)
    exec "$ROOT_DIR/scripts/ios.sh"
    ;;
  reload:) reload_app ;;
  stop:backend|stop:frontend) stop_service "$target" ;; stop:all) stop_service frontend; stop_service backend ;;
  restart:backend) stop_service backend; start_backend ;; restart:frontend) stop_service frontend; start_frontend "$mode" ;; restart:all) stop_service frontend; stop_service backend; start_backend && start_frontend "$mode" ;;
  status:) status_service backend; status_service frontend ;; logs:backend|logs:frontend) logs_service "$target" ;;
  *) usage; exit 2 ;;
esac
