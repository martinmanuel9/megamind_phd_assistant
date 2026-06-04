#!/usr/bin/env bash
# Research Assistant launcher: Docker → local Supabase → web app → browser,
# served at a friendly hostname (default http://research-assistant:3000).
#
#   bash scripts/research-assistant.sh
#   RA_HOST=research-assistant RA_PORT=3000 bash scripts/research-assistant.sh
#
# RA_HOST=localhost skips the /etc/hosts alias (plain http://localhost:PORT).
set -euo pipefail
cd "$(dirname "$0")/.."

RA_HOST="${RA_HOST:-research-assistant}"
RA_PORT="${RA_PORT:-3000}"
LOG="${TMPDIR:-/tmp}/research-assistant-web.log"

say() { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }

# 1. Docker (local Supabase needs it) -----------------------------------------
if ! docker info >/dev/null 2>&1; then
  say "Starting Docker…"
  [ "$(uname)" = "Darwin" ] && open -a Docker 2>/dev/null || true
  for _ in $(seq 1 24); do docker info >/dev/null 2>&1 && break; sleep 5; done
  docker info >/dev/null 2>&1 || { echo "Docker isn't running. Start Docker Desktop and retry."; exit 1; }
fi
say "Docker ready"

# 2. Local Supabase (idempotent) ----------------------------------------------
if supabase status >/dev/null 2>&1; then say "Supabase already running"; else say "Starting Supabase…"; supabase start; fi

# 3. Friendly hostname via /etc/hosts (one-time, needs sudo) -------------------
if [ "$RA_HOST" != "localhost" ] && [ "$RA_HOST" != "127.0.0.1" ]; then
  if ! grep -qE "[[:space:]]${RA_HOST}([[:space:]]|$)" /etc/hosts 2>/dev/null; then
    say "Mapping ${RA_HOST} → 127.0.0.1 in /etc/hosts (one-time, sudo)…"
    if printf "127.0.0.1\t%s\n" "$RA_HOST" | sudo tee -a /etc/hosts >/dev/null 2>&1; then
      say "Hostname configured"
    else
      echo "Couldn't edit /etc/hosts — using http://localhost:${RA_PORT} instead."
      RA_HOST="localhost"
    fi
  fi
fi
URL="http://${RA_HOST}:${RA_PORT}"

# 4. Build the web app on first run -------------------------------------------
if [ ! -f apps/web/.next/BUILD_ID ]; then say "Building the web app (first run only)…"; npm run build --workspace @lob/web; fi

# 5. Start web (bound to 0.0.0.0 so the alias resolves), open browser ----------
export RA_HOST RA_PORT   # consumed by next.config for serverActions.allowedOrigins
say "Starting web app…"
( cd apps/web && exec npx next start -H 0.0.0.0 -p "$RA_PORT" ) > "$LOG" 2>&1 &
WEB_PID=$!
trap 'kill $WEB_PID 2>/dev/null || true' INT TERM
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:${RA_PORT}/" && break; sleep 1; done

echo ""
say "Research Assistant is running:  ${URL}"
echo "    • Start the MCP server + connect clients from the dashboard (/server, /connect)"
echo "    • Ctrl-C stops the web app. Supabase keeps running ('npm run down' to stop it)."
echo "    • Web log: ${LOG}"
echo ""
[ "$(uname)" = "Darwin" ] && open "$URL" 2>/dev/null || true

wait $WEB_PID
