#!/usr/bin/env bash
# One command to run Wasla locally: the backend (Docker), the staff website and
# the patient app.
#
#   ./dev.sh          backend + website + patient app (Expo dev server)
#   ./dev.sh --web    same, but the patient app opens in the browser
#   ./dev.sh --mock   no Docker: both frontends talk to the mock API (pnpm mock)
#
# Ctrl+C stops the website, the app and the mock. The Docker stack keeps
# running; stop it with `docker compose down`.
set -euo pipefail

cd "$(dirname "$0")"

APP_MODE=start
USE_MOCK=0
for arg in "$@"; do
  case "$arg" in
    --web) APP_MODE=web ;;
    --mock) USE_MOCK=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Install once up front (quick when nothing changed); otherwise the website and
# the app each start pnpm's own dependency check at the same time and collide.
echo "==> Installing dependencies"
pnpm install

if [ "$USE_MOCK" = 1 ]; then
  echo "==> Starting the mock API on http://localhost:4010"
  pnpm mock &
  pids+=($!)
  export VITE_PROXY_TARGET=http://localhost:4010
  export EXPO_PUBLIC_API_URL=http://localhost:4010
else
  [ -f .env ] || { echo "==> No .env yet: copying .env.example"; cp .env.example .env; }

  echo "==> Starting the backend (docker compose)"
  docker compose up --build -d

  # The frontends must call the gateway on the port .env gives it (8080 can
  # be taken by another program, so GATEWAY_PORT may differ).
  GATEWAY_PORT=$(grep -E '^GATEWAY_PORT=' .env | tail -1 | cut -d= -f2 | tr -d '\r"' || true)
  GATEWAY_PORT=${GATEWAY_PORT:-8080}
  export VITE_PROXY_TARGET="http://localhost:$GATEWAY_PORT"
  export EXPO_PUBLIC_API_URL="http://localhost:$GATEWAY_PORT"
  echo "==> Gateway: http://localhost:$GATEWAY_PORT"

  echo "==> Adding demo data (skipped if the database already has data)"
  if docker compose --profile demo run --rm seed >/dev/null 2>&1; then
    echo "    Demo data added."
  else
    echo "    Database already has data; left as is."
  fi
fi

echo "==> Starting the staff website (Vite, http://localhost:5173)"
pnpm --filter @wasla/hospital-dashboard dev &
pids+=($!)

# Expo stays in the foreground so its QR code and key shortcuts work.
echo "==> Starting the patient app (Expo)"
pnpm --filter @wasla/patient-app "$APP_MODE"
