#!/usr/bin/env bash
# Render the Mermaid sources in docs/diagrams/*.mmd to PNGs. Usage: npm run diagrams
set -euo pipefail
cd "$(dirname "$0")/.."
for mmd in docs/diagrams/*.mmd; do
  out="${mmd%.mmd}.png"
  echo "rendering $out"
  npx -y @mermaid-js/mermaid-cli -i "$mmd" -o "$out" -t neutral -b white
done
