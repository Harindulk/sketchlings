#!/usr/bin/env bash
# Runs the server behind a temporary public HTTPS link (Cloudflare quick tunnel), so phones get a secure page
# and mic "shout" works (getUserMedia needs a secure context). The link exists only while this script runs.
# The TV still talks to the server over the LAN / 10.0.2.2. Ctrl-C stops the tunnel and the server.
set -euo pipefail
cd "$(dirname "$0")/.."
# scripts/session.sh --no-ai (a consent form said No to AI): no key, so no drawing goes to Claude, even when run by hand
if [ -e video/clips/.no-ai ]; then export ANTHROPIC_API_KEY=; fi
LOG=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://localhost:8787 >"$LOG" 2>&1 &
TUN=$!
trap 'kill $TUN 2>/dev/null || true; rm -f "$LOG"' EXIT
URL=""
for _ in $(seq 60); do
  # api.trycloudflare.com is in cloudflared's error line when it can't get a tunnel (no internet, captive portal)
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | grep -v '^https://api\.' | head -1 || true)
  [ -n "$URL" ] && break
  kill -0 $TUN 2>/dev/null || break
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel did not start (no internet or a captive portal? open any https page, or use a phone hotspot):"; cat "$LOG"; exit 1; }
# The link prints before the edge connects; without a connection (port 7844 blocked) phones get Cloudflare's 530 page.
for _ in $(seq 30); do
  grep -q 'Registered tunnel connection' "$LOG" && break
  kill -0 $TUN 2>/dev/null || break
  sleep 1
done
grep -q 'Registered tunnel connection' "$LOG" || {
  echo "Tunnel $URL has no connection (port 7844 blocked? use a phone hotspot). Nothing on port 8787 was stopped:"
  grep -E 'ERR|failed' "$LOG" | tail -5 || true
  exit 1
}
# only now, with a working tunnel, replace a server already on 8787
OLD=$(lsof -tiTCP:8787 -sTCP:LISTEN || true)
[ -n "$OLD" ] && kill $OLD && sleep 1
echo "Phones join at $URL/j/<CODE> (the TV's QR code shows it)"
cd server && PUBLIC_URL="$URL" bun run start
