#!/usr/bin/env bash
# Research Assistant launcher: Docker → local Supabase → web app → browser,
# served at a clean hostname over HTTPS with a local Caddy cert by default
# (https://research-assistant). Config comes from .env (see .env.example) and
# can be overridden inline.
#
#   npm run start:app           # or: bash scripts/research-assistant.sh
#
# Knobs (env or .env): RA_HOST, RA_SCHEME (https|http), RA_PORT, RA_INTERNAL_PORT.
set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env if present (launcher config + any env overrides).
if [ -f .env ]; then set -a; . ./.env; set +a; fi

RA_HOST="${RA_HOST:-research-assistant}"
RA_SCHEME="${RA_SCHEME:-https}"
RA_INTERNAL_PORT="${RA_INTERNAL_PORT:-8788}"
LOG="${TMPDIR:-/tmp}/research-assistant-web.log"
CADDYFILE="${TMPDIR:-/tmp}/research-assistant.Caddyfile"

say() { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }

# Proxy decision: HTTPS always needs Caddy (TLS termination); HTTP only for a
# privileged public port.
if [ "$RA_SCHEME" = "https" ]; then
  RA_PORT="${RA_PORT:-443}"
  NEED_PROXY=true
else
  RA_PORT="${RA_PORT:-80}"
  if [ "$RA_PORT" -lt 1024 ] && [ "$RA_PORT" != "$RA_INTERNAL_PORT" ]; then NEED_PROXY=true; else RA_INTERNAL_PORT="$RA_PORT"; NEED_PROXY=false; fi
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

# 4. Caddy reverse proxy (TLS for https, or privileged-port forward) ----------
PROXY_OK=false
if [ "$NEED_PROXY" = true ]; then
  if command -v caddy >/dev/null 2>&1; then
    if [ "$RA_SCHEME" = "https" ]; then
      # skip_install_trust keeps `caddy start` from blocking on a keychain prompt;
      # we install the CA explicitly via `caddy trust` once it's up.
      cat > "$CADDYFILE" <<EOF
{
	skip_install_trust
}
${RA_HOST}:${RA_PORT} {
	tls internal
	reverse_proxy 127.0.0.1:${RA_INTERNAL_PORT}
}
EOF
    else
      cat > "$CADDYFILE" <<EOF
{
	auto_https off
}
http://${RA_HOST}:${RA_PORT} {
	reverse_proxy 127.0.0.1:${RA_INTERNAL_PORT}
}
EOF
    fi
    say "Starting reverse proxy (caddy, sudo): ${RA_SCHEME} :${RA_PORT} → :${RA_INTERNAL_PORT}…"
    sudo caddy stop >/dev/null 2>&1 || true
    if sudo caddy start --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
      PROXY_OK=true
      # Install Caddy's local CA into the system trust store (best-effort) so the
      # browser trusts the https cert without warnings.
      [ "$RA_SCHEME" = "https" ] && sudo caddy trust >/dev/null 2>&1 || true
    fi
  fi
  if [ "$PROXY_OK" != true ]; then
    echo "Reverse proxy unavailable (need caddy + sudo). Falling back to http://${RA_HOST}:${RA_INTERNAL_PORT}."
    RA_SCHEME="http"
  fi
fi

# Compute the URL to open.
if [ "$NEED_PROXY" = true ] && [ "$PROXY_OK" = true ]; then
  DEFAULT_PORT=$([ "$RA_SCHEME" = "https" ] && echo 443 || echo 80)
  if [ "$RA_PORT" = "$DEFAULT_PORT" ]; then URL="${RA_SCHEME}://${RA_HOST}"; else URL="${RA_SCHEME}://${RA_HOST}:${RA_PORT}"; fi
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
