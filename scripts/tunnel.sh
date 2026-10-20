#!/usr/bin/env bash
# Runs the server behind a temporary public HTTPS link (Cloudflare quick tunnel), so phones get a secure page
# and mic "shout" works (getUserMedia needs a secure context). The link exists only while this script runs.
# The TV still talks to the server over the LAN / 10.0.2.2. Ctrl-C stops the tunnel and the server.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://localhost:8787 >"$LOG" 2>&1 &
TUN=$!
trap 'kill $TUN 2>/dev/null || true; rm -f "$LOG"' EXIT
URL=""
for _ in $(seq 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel did not start:"; cat "$LOG"; exit 1; }
OLD=$(lsof -tiTCP:8787 -sTCP:LISTEN || true)
[ -n "$OLD" ] && kill $OLD && sleep 1
echo "Phones join at $URL/j/<CODE> (the TV's QR code shows it)"
cd server && PUBLIC_URL="$URL" bun run start
