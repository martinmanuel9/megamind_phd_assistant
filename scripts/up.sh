#!/usr/bin/env bash
# One-command start: Docker -> local Supabase -> web app.
# Usage: npm run up
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Docker must be running (local Supabase needs it).
if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running — attempting to start it…"
  if [[ "$(uname)" == "Darwin" ]]; then open -a Docker 2>/dev/null || true; fi
  for _ in $(seq 1 18); do
    docker info >/dev/null 2>&1 && break
    sleep 5
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker still not ready. Start Docker Desktop and re-run: npm run up" >&2
    exit 1
  fi
fi
echo "✓ Docker is running"

# 2. Local Supabase (idempotent — skip if already up).
if supabase status >/dev/null 2>&1; then
  echo "✓ Supabase already running"
else
  echo "Starting local Supabase…"
  supabase start
fi

# 3. Web app (blocks — Ctrl-C to stop). Start the MCP server from the UI (/server).
echo ""
echo "→ Dashboard:  http://localhost:3000"
echo "→ Supabase Studio: http://localhost:54323"
echo "Starting web app (Ctrl-C to stop)…"
echo ""
exec npm run dev --workspace @lob/web
