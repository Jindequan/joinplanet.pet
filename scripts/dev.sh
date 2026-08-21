#!/usr/bin/env bash
# PLANET local development process manager.
#
#   scripts/dev.sh start all device
#   scripts/dev.sh start backend
#   scripts/dev.sh restart frontend device
#   scripts/dev.sh status
#   scripts/dev.sh logs frontend
#   scripts/dev.sh stop all
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${DEV_STATE_DIR:-$ROOT_DIR/.dev}"
API_PORT="${API_PORT:-8081}"
EXPO_PORT="${EXPO_PORT:-8082}"
APP_DIR="$ROOT_DIR/mobile-v2"
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
  local pid lan_ip cors_origins
  pid="$(pid_from_file "$API_PID_FILE")"
  if api_health; then echo "backend: UP on :${API_PORT}${pid:+ (pid $pid)}"; return 0; fi
  if pid_alive "$pid"; then echo "backend: pid $pid is running but unhealthy; see $BACKEND_LOG"; return 1; fi
  echo "backend: starting on 0.0.0.0:${API_PORT}"
  lan_ip="${LAN_IP:-$(detect_lan_ip)}"
  cors_origins="${CORS_ORIGINS:-http://localhost:${EXPO_PORT},http://127.0.0.1:${EXPO_PORT}}"
  if [ -n "$lan_ip" ]; then cors_origins="${cors_origins},http://${lan_ip}:${EXPO_PORT}"; fi
  # shellcheck disable=SC2016
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "${DATABASE_URL:-postgres:///planet}" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  elif command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die $!;' -- \
      bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "${DATABASE_URL:-postgres:///planet}" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  else
    nohup bash -c 'cd "$1" && exec env DATABASE_URL="$2" BIND="$3" CORS_ORIGINS="$4" DEV_AUTH_CODES="$5" go run ./cmd/planet-api' \
      bash "$ROOT_DIR/planet-api" "${DATABASE_URL:-postgres:///planet}" "0.0.0.0:${API_PORT}" "$cors_origins" "${DEV_AUTH_CODES:-1}" \
      >>"$BACKEND_LOG" 2>&1 < /dev/null &
  fi
  pid=$!; write_pid "$API_PID_FILE" "$pid"
  if wait_for_api; then echo "backend: ready (pid $pid), log $BACKEND_LOG"; else echo "backend: failed; see $BACKEND_LOG"; return 1; fi
}

start_frontend() {
  local mode="${1:-device}" api_host api_origin api_base_url pid expo_args
  case "$mode" in
    device) api_host="${LAN_IP:-$(detect_lan_ip)}"; expo_args=(--lan) ;;
    *) echo "frontend: mode must be device"; return 2 ;;
  esac
  if [ "$mode" = device ] && [ -z "$api_host" ]; then echo "frontend: set LAN_IP=192.168.x.x"; return 1; fi
  api_origin="http://${api_host}:${API_PORT}"
  api_base_url="${api_origin}/api/v1"
  pid="$(pid_from_file "$FRONTEND_PID_FILE")"
  if pid_alive "$pid"; then echo "frontend: UP (pid $pid, mode $(cat "$FRONTEND_MODE_FILE" 2>/dev/null || echo unknown))"; return 0; fi
  if ! curl -fsS --max-time 2 "${api_origin}/healthz" >/dev/null 2>&1; then echo "frontend: API unavailable at ${api_origin}; start backend first"; return 1; fi
  echo "frontend: starting Expo ${mode} on :${EXPO_PORT} (API ${api_base_url})"
  # shellcheck disable=SC2016
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash -c 'cd "$1" && exec env EXPO_PUBLIC_API_BASE_URL="$2" npx expo start "${@:3}"' \
      bash "$APP_DIR" "$api_base_url" "${expo_args[@]}" --port "$EXPO_PORT" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  elif command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die $!;' -- \
      bash -c 'cd "$1" && exec env EXPO_PUBLIC_API_BASE_URL="$2" npx expo start "${@:3}"' \
      bash "$APP_DIR" "$api_base_url" "${expo_args[@]}" --port "$EXPO_PORT" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  else
    nohup bash -c 'cd "$1" && exec env EXPO_PUBLIC_API_BASE_URL="$2" npx expo start "${@:3}"' \
      bash "$APP_DIR" "$api_base_url" "${expo_args[@]}" --port "$EXPO_PORT" --clear \
      >>"$FRONTEND_LOG" 2>&1 < /dev/null &
  fi
  pid=$!; write_pid "$FRONTEND_PID_FILE" "$pid"; printf '%s\n' "$mode" > "$FRONTEND_MODE_FILE"
  if wait_for_port "$EXPO_PORT"; then
    echo "frontend: ready (pid $pid), log $FRONTEND_LOG"
    echo "frontend: Expo Go URL exp://${api_host}:${EXPO_PORT}"
  else
    echo "frontend: not ready; see $FRONTEND_LOG"
    return 1
  fi
}

stop_service() {
  local service="$1" file pid port kind port_pid
  case "$service" in backend) file="$API_PID_FILE" ;; frontend) file="$FRONTEND_PID_FILE" ;; *) echo "service must be backend or frontend"; return 2 ;; esac
  if [ "$service" = backend ]; then port="$API_PORT"; kind=backend; else port="$EXPO_PORT"; kind=frontend; fi
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
      local pid mode
      pid="$(pid_from_file "$FRONTEND_PID_FILE")"
      mode="$(cat "$FRONTEND_MODE_FILE" 2>/dev/null || echo unknown)"
      if [ -n "$(port_pids "$EXPO_PORT")" ]; then
        echo "frontend: UP on :${EXPO_PORT} (mode $mode, managed pid ${pid:-none})"
      else
        echo "frontend: DOWN on :${EXPO_PORT}"
      fi
      ;;
  esac
}

logs_service() {
  case "$1" in backend) exec tail -n 80 -f "$BACKEND_LOG" ;; frontend) exec tail -n 80 -f "$FRONTEND_LOG" ;; *) echo "logs target must be backend or frontend"; return 2 ;; esac
}

usage() {
  cat <<'EOF'
PLANET dev controller
  scripts/dev.sh start|stop|restart backend|frontend|all [device]
  scripts/dev.sh status
  scripts/dev.sh logs backend|frontend

Environment: API_PORT=8081 EXPO_PORT=8082 LAN_IP=192.168.x.x DEV_STATE_DIR=/tmp/planet-dev
EOF
}

action="${1:-status}"; target="${2:-}"; mode="${3:-device}"
case "$action:$target" in
  backend:start|backend:stop|backend:restart|frontend:start|frontend:stop|frontend:restart|all:start|all:stop|all:restart)
    mode="${3:-device}"
    old_action="$action"; action="$target"; target="$old_action"
    ;;
esac
case "$action:$target" in
  start:backend) start_backend ;; start:frontend) start_frontend "$mode" ;; start:all) start_backend && start_frontend "$mode" ;;
  stop:backend|stop:frontend) stop_service "$target" ;; stop:all) stop_service frontend; stop_service backend ;;
  restart:backend) stop_service backend; start_backend ;; restart:frontend) stop_service frontend; start_frontend "$mode" ;; restart:all) stop_service frontend; stop_service backend; start_backend && start_frontend "$mode" ;;
  status:) status_service backend; status_service frontend ;; logs:backend|logs:frontend) logs_service "$target" ;;
  *) usage; exit 2 ;;
esac
