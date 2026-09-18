#!/usr/bin/env bash
# Read-only production smoke check for the three user-facing origins.
# No credentials are required; this only verifies that public entry points
# complete a TLS/HTTP request and that the API health response is authoritative.
set -euo pipefail

WEB_URL="${PLANET_WEB_URL:-https://www.joinplanet.pet}"
APP_URL="${PLANET_APP_URL:-https://app.joinplanet.pet/auth}"
API_URL="${PLANET_API_URL:-https://api.joinplanet.pet/healthz}"
API_READY_URL="${PLANET_API_READY_URL:-https://api.joinplanet.pet/readyz}"
API_BASE_URL="${PLANET_API_BASE_URL:-https://api.joinplanet.pet/api/v1}"
LANDING_PROGRESS_URL="${PLANET_LANDING_PROGRESS_URL:-https://api.joinplanet.pet/progress}"
APP_ORIGIN="${PLANET_APP_ORIGIN:-https://app.joinplanet.pet}"
TIMEOUT="${PLANET_SMOKE_TIMEOUT_SECONDS:-15}"
CURL_RETRY_ARGS=(--retry 2 --retry-delay 1 --retry-all-errors)

failures=0

check_http() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local body_file
  body_file="$(mktemp)"

  local result
  if ! result="$(curl --silent --show-error --location --max-time "$TIMEOUT" \
    "${CURL_RETRY_ARGS[@]}" \
    --output "$body_file" --write-out '%{http_code} %{url_effective}' "$url" 2>&1)"; then
    echo "FAIL — $name request failed: $result"
    rm -f "$body_file"
    failures=$((failures + 1))
    return
  fi

  local code="${result%% *}"
  local effective="${result#* }"
  if [[ "$code" != $expected ]]; then
    echo "FAIL — $name returned HTTP $code (expected $expected) at $effective"
    rm -f "$body_file"
    failures=$((failures + 1))
    return
  fi
  echo "PASS — $name returned HTTP $code at $effective"
  rm -f "$body_file"
}

check_http "landing" "$WEB_URL" '2??'
check_http "app" "$APP_URL" '2??'
landing_progress_body="$(mktemp)"
landing_progress_result=""
if landing_progress_result="$(curl --silent --show-error --location --max-time "$TIMEOUT" \
  "${CURL_RETRY_ARGS[@]}" \
  --output "$landing_progress_body" --write-out '%{http_code} %{url_effective}' "$LANDING_PROGRESS_URL" 2>&1)"; then
  landing_progress_code="${landing_progress_result%% *}"
  landing_progress_effective="${landing_progress_result#* }"
  if [[ "$landing_progress_code" == 200 ]] && python3 - "$landing_progress_body" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if not isinstance(payload.get("capacity"), int) or not isinstance(payload.get("currentVariant"), str):
    raise SystemExit(1)
PY
  then
    echo "PASS — landing progress returned authoritative capacity data at $landing_progress_effective"
  else
    echo "FAIL — landing progress did not return authoritative capacity data at $landing_progress_effective"
    failures=$((failures + 1))
  fi
else
  echo "FAIL — landing progress request failed: $landing_progress_result"
  failures=$((failures + 1))
fi
rm -f "$landing_progress_body"
check_http "api ready" "$API_READY_URL" '200'

api_body="$(mktemp)"
api_headers="$(mktemp)"
auth_body="$(mktemp)"
trap 'rm -f "$api_body" "$api_headers" "$auth_body"' EXIT
api_result=""
if api_result="$(curl --silent --show-error --location --max-time "$TIMEOUT" \
  "${CURL_RETRY_ARGS[@]}" \
  --output "$api_body" --write-out '%{http_code} %{url_effective}' "$API_URL" 2>&1)"; then
  api_code="${api_result%% *}"
  api_effective="${api_result#* }"
  if [[ "$api_code" == 2?? ]] && python3 - "$api_body" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if payload.get("status") != "ok":
    raise SystemExit(1)
PY
  then
    echo "PASS — api health returned status=ok at $api_effective"
  else
    echo "FAIL — api health was not an authoritative status=ok response at $api_effective"
    failures=$((failures + 1))
  fi
else
  echo "FAIL — api health request failed: $api_result"
  failures=$((failures + 1))
fi

# Health alone is insufficient: verify the login contract this deployment advertises.
# 2026-09-18 the product ruling made production Apple-only, so a hardcoded
# "request-code must be 400" would flag a correct deployment as broken. Ask
# /auth/methods first, then assert the endpoints agree with what it declares.
methods_body="$(mktemp)"
methods_result=""
if methods_result="$(curl --silent --show-error --max-time "$TIMEOUT" \
  "${CURL_RETRY_ARGS[@]}" \
  --output "$methods_body" --write-out '%{http_code}' "$API_BASE_URL/auth/methods" 2>&1)"; then
  if [[ "$methods_result" == "200" ]] && python3 - "$methods_body" <<'SMOKEPY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
apple = bool(payload.get("apple", {}).get("enabled"))
email = bool(payload.get("email", {}).get("enabled"))
if not apple:
    raise SystemExit("apple login must be advertised")
if not apple and not email:
    raise SystemExit("no login method advertised")
SMOKEPY
  then
    apple_enabled="$(python3 -c 'import json,sys;print(str(json.load(open(sys.argv[1])).get("apple",{}).get("enabled")).lower())' "$methods_body")"
    email_enabled="$(python3 -c 'import json,sys;print(str(json.load(open(sys.argv[1])).get("email",{}).get("enabled")).lower())' "$methods_body")"
    echo "PASS — auth methods advertise apple=$apple_enabled email=$email_enabled"

    expected_code=410
    expected_error=EMAIL_LOGIN_DISABLED
    if [[ "$email_enabled" == "true" ]]; then
      expected_code=400
      expected_error=VALIDATION_FAILED
    fi
    auth_body="$(mktemp)"
    auth_headers="$(mktemp)"
    auth_result=""
    if auth_result="$(curl --silent --show-error --max-time "$TIMEOUT" \
      "${CURL_RETRY_ARGS[@]}" \
      --output "$auth_body" --dump-header "$auth_headers" --write-out '%{http_code}' \
      --request POST "$API_BASE_URL/auth/request-code" \
      --header "Origin: $APP_ORIGIN" \
      --header 'Content-Type: application/json' \
      --data '{"email":""}' 2>&1)"; then
      auth_allow="$(awk 'tolower($0) ~ /^access-control-allow-origin:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/[\r\n]/, ""); print; exit }' "$auth_headers")"
      if [[ "$auth_result" == "$expected_code" && "$auth_allow" == "$APP_ORIGIN" ]] && \
        python3 - "$auth_body" "$expected_error" <<'SMOKEPY2'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if payload.get("error", {}).get("code") != sys.argv[2]:
    raise SystemExit(1)
SMOKEPY2
      then
        echo "PASS — login route returns $expected_code $expected_error and CORS allows $APP_ORIGIN"
      else
        echo "FAIL — login route returned HTTP $auth_result with allow-origin=${auth_allow:-<missing>} (want $expected_code $expected_error)"
        failures=$((failures + 1))
      fi
    else
      echo "FAIL — login route probe failed: $auth_result"
      failures=$((failures + 1))
    fi
    rm -f "$auth_body" "$auth_headers"
  else
    echo "FAIL — /auth/methods did not return a usable login contract (HTTP $methods_result)"
    failures=$((failures + 1))
  fi
else
  echo "FAIL — /auth/methods request failed: $methods_result"
  failures=$((failures + 1))
fi
rm -f "$methods_body"

if ((failures > 0)); then
  echo "production-smoke: $failures check(s) failed" >&2
  exit 1
fi
echo "production-smoke: all public entry points passed"
