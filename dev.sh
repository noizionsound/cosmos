#!/bin/bash
# ─── COSMOS local dev server ───────────────────────────────────────────────────
# Run:  bash dev.sh
# Opens http://localhost:8080 — ES modules work, HRTF works (localhost = secure)
# ──────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

# Try npx serve first, then python, then php
if command -v npx &>/dev/null; then
  echo "→ Starting on http://localhost:8080"
  npx serve . -l 8080 --no-clipboard 2>/dev/null
elif command -v python3 &>/dev/null; then
  echo "→ Starting on http://localhost:8080"
  python3 -m http.server 8080
elif command -v python &>/dev/null; then
  echo "→ Starting on http://localhost:8080"
  python -m SimpleHTTPServer 8080
elif command -v php &>/dev/null; then
  echo "→ Starting on http://localhost:8080"
  php -S localhost:8080
else
  echo "ERROR: no server found. Install Node.js (npx serve) or Python."
  exit 1
fi
