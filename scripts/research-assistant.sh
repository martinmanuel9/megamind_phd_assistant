#!/usr/bin/env bash
# Research Assistant launcher: Docker → local Supabase → web app → browser,
# served at a clean hostname (default http://research-assistant via a port-80
# reverse proxy to a unique internal port).
#
#   bash scripts/research-assistant.sh
#
# Env overrides:
#   RA_HOST           hostname alias (default research-assistant)
#   RA_PORT           public URL port (default 80; <1024 uses a caddy proxy)
#   RA_INTERNAL_PORT  port the web app actually binds (default 8788)
#   RA_HOST=localhost skips the /etc/hosts alias.
set -euo pipefail
cd "$(dirname "$0")/.."

RA_HOST="${RA_HOST:-research-assistant}"
RA_PORT="${RA_PORT:-80}"
RA_INTERNAL_PORT="${RA_INTERNAL_PORT:-8788}"
LOG="${TMPDIR:-/tmp}/research-assistant-web.log"
CADDYFILE="${TMPDIR:-/tmp}/research-assistant.Caddyfile"

say() { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }

# Decide whether we need a privileged reverse proxy. For non-privileged public
# ports we just bind the web app there directly.
NEED_PROXY=false
if [ "$RA_PORT" -lt 1024 ] && [ "$RA_PORT" != "$RA_INTERNAL_PORT" ]; then
  NEED_PROXY=true
else
  RA_INTERNAL_PORT="$RA_PORT"
fi

# 1. Docker -------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  say "Starting Docker…"
  [ "$(uname)" = "Darwin" ] && open -a Docker 2>/dev/null || true
  for _ in $(seq 1 24); do docker info >/dev/null 2>&1 && break; sleep 5; done
  docker info >/dev/null 2>&1 || { echo "Docker isn't running. Start Docker Desktop and retry."; exit 1; }
fi
say "Docker ready"

# 2. Local Supabase (idempotent) ----------------------------------------------
if supabase status >/dev/null 2>&1; then say "Supabase already running"; else say "Starting Supabase…"; supabase start; fi

# 3. Friendly hostname via /etc/hosts (one-time, sudo) ------------------------
if [ "$RA_HOST" != "localhost" ] && [ "$RA_HOST" != "127.0.0.1" ]; then
  if ! grep -qE "[[:space:]]${RA_HOST}([[:space:]]|$)" /etc/hosts 2>/dev/null; then
    say "Mapping ${RA_HOST} → 127.0.0.1 in /etc/hosts (one-time, sudo)…"
    printf "127.0.0.1\t%s\n" "$RA_HOST" | sudo tee -a /etc/hosts >/dev/null 2>&1 \
      || { echo "Couldn't edit /etc/hosts — using localhost."; RA_HOST="localhost"; }
  fi
fi

# 4. Reverse proxy on the privileged public port (caddy, sudo) ----------------
PROXY_OK=false
if [ "$NEED_PROXY" = true ]; then
  if command -v caddy >/dev/null 2>&1; then
    cat > "$CADDYFILE" <<EOF
{
	auto_https off
}
http://${RA_HOST}:${RA_PORT} {
	reverse_proxy 127.0.0.1:${RA_INTERNAL_PORT}
}
EOF
    say "Starting reverse proxy :${RA_PORT} → :${RA_INTERNAL_PORT} (caddy, sudo)…"
    sudo caddy stop >/dev/null 2>&1 || true
    if sudo caddy start --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
      PROXY_OK=true
    fi
  fi
  if [ "$PROXY_OK" != true ]; then
    echo "Reverse proxy unavailable (need caddy + sudo). Serving directly on :${RA_INTERNAL_PORT}."
  fi
fi

# Compute the URL the user should open.
if [ "$NEED_PROXY" = true ] && [ "$PROXY_OK" = true ]; then
  if [ "$RA_PORT" = "80" ]; then URL="http://${RA_HOST}"; else URL="http://${RA_HOST}:${RA_PORT}"; fi
else
  URL="http://${RA_HOST}:${RA_INTERNAL_PORT}"
fi

# 5. Build the web app on first run -------------------------------------------
if [ ! -f apps/web/.next/BUILD_ID ]; then say "Building the web app (first run only)…"; npm run build --workspace @lob/web; fi

# 6. Start web (bound to 0.0.0.0 so the alias + proxy reach it) ---------------
export RA_HOST RA_PORT RA_INTERNAL_PORT   # consumed by next.config allowedOrigins
say "Starting web app on :${RA_INTERNAL_PORT}…"
( cd apps/web && exec npx next start -H 0.0.0.0 -p "$RA_INTERNAL_PORT" ) > "$LOG" 2>&1 &
WEB_PID=$!
trap 'kill $WEB_PID 2>/dev/null || true' INT TERM
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:${RA_INTERNAL_PORT}/" && break; sleep 1; done

echo ""
say "Research Assistant is running:  ${URL}"
echo "    • Start the MCP server + connect clients from the dashboard (/server, /connect)"
echo "    • Ctrl-C stops the web app. Supabase + proxy keep running ('npm run down' to stop them)."
echo "    • Web log: ${LOG}"
echo ""
[ "$(uname)" = "Darwin" ] && open "$URL" 2>/dev/null || true

wait $WEB_PID
