#!/usr/bin/env bash
# Stop local services. Usage: npm run down
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Stopping local Supabase…"
supabase stop || true
echo "✓ Supabase stopped."
echo "Note: stop the web app with Ctrl-C, and the MCP server from the UI (/server) or it keeps running."
