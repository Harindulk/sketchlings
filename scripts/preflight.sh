#!/usr/bin/env bash
# Filming-day pre-flight: read-only checks, prints PASS/FAIL per line. Never kills, moves or deletes anything.
# Run it right before the family plays (after the hall reset):  scripts/preflight.sh
# Exit code 0 = all PASS, 1 = something to fix first. See docs/playtest/runsheet.md.
set -uo pipefail
cd "$(dirname "$0")/.."
FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n      -> %s\n' "$1" "$2"; FAILS=$((FAILS + 1)); }

# 1. Free RAM > 6 GB (the headless VVD crashes when the Mac swaps, notes/tv.md F5)
total=$(sysctl -n hw.memsize)
level=$(sysctl -n kern.memorystatus_level) # the "System-wide memory free percentage" of memory_pressure
free_gb=$(awk -v t="$total" -v l="$level" 'BEGIN { printf "%.1f", t * l / 100 / 1e9 }')
swap=$(sysctl -n vm.swapusage | awk '{print $6}')
if awk -v f="$free_gb" 'BEGIN { exit !(f > 6) }'; then pass "Free RAM ${free_gb} GB (swap used ${swap})"
else fail "Free RAM ${free_gb} GB, need > 6 GB (swap used ${swap})" "quit Unity, Blender, Docker, browsers; restart the Mac if swap stays high"; fi

# 2. Unity not running (its adb fights ours and drops key presses, F6)
# match executables, not command lines that merely mention a Unity path; the adb server is checked by its binary
unity=$(ps -axo pid=,comm= | awk '$2 ~ /Unity\.app\/Contents\/MacOS\/Unity$/ {print $1}')
unity_adb=$(for p in $(pgrep -x adb); do lsof -a -p "$p" -d txt -Fn 2>/dev/null | grep -q 'PlaybackEngines/AndroidPlayer' && echo "$p"; done)
if [ -z "$unity$unity_adb" ]; then pass "Unity Editor and Unity's adb are not running"
else fail "Unity Editor or Unity's adb server is running (pids: $(echo $unity $unity_adb))" "quit the Unity Editor, then: adb kill-server && adb start-server (restarts adb from the Vega/Homebrew copy)"; fi

# 3. Free disk > 5 GB (screen recordings, phone footage copied over)
disk_gb=$(df -k "$HOME" | awk 'NR==2 { printf "%.1f", $4 * 1024 / 1e9 }')
if awk -v d="$disk_gb" 'BEGIN { exit !(d > 5) }'; then pass "Free disk ${disk_gb} GB"
else fail "Free disk ${disk_gb} GB, need > 5 GB" "empty Downloads/Trash yourself, move old footage to an external drive"; fi

# 4. Server up on 8787
if curl -s -m 3 http://localhost:8787/health | grep -q '"ok":true'; then pass "Server answers on http://localhost:8787/health"
else fail "Server not answering on port 8787" "start the session (runsheet 3.2): scripts/session.sh"; fi

# 5. Claude key: present in server/.env (value never printed) and the newest server log's banner says Claude.
# With AI off on purpose (scripts/session.sh --no-ai, a form said No) the banner must say offline instead.
log=$(ls -t notes/*.log 2>/dev/null | head -1)
banner=$([ -n "$log" ] && grep -E '^Personas:' "$log" | tail -1)
if [ -e video/clips/.no-ai ]; then
  case "$banner" in
    "Personas: offline"*) pass "AI personas off on purpose (video/clips/.no-ai): newest log ($log) says offline" ;;
    *) fail "AI is off on purpose (video/clips/.no-ai), but the newest log (${log:-none}) does not say \"Personas: offline\"" "scripts/session.sh stop, then scripts/session.sh (it starts the server with no key)" ;;
  esac
else
  if grep -qE '^ANTHROPIC_API_KEY=.+' server/.env 2>/dev/null; then pass "server/.env has an ANTHROPIC_API_KEY"
  else fail "No ANTHROPIC_API_KEY in server/.env" "paste the key into server/.env, then scripts/session.sh stop and scripts/session.sh"; fi
  case "$banner" in
    "Personas: Claude"*) pass "Newest log ($log): ${banner%%,*}" ;;
    *) fail "Newest log (${log:-none}) does not say \"Personas: Claude\"" "start the server with scripts/session.sh (runsheet 3.2) and check the key" ;;
  esac
fi

# 6. Hall of Fame reset: file missing or < 3 entries, and the running server agrees (it keeps the hall in memory)
file_n=$( [ -f server/data/hall.json ] && python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' server/data/hall.json 2>/dev/null || echo 0)
api_n=$(curl -s -m 3 http://localhost:8787/api/hall-of-fame | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "?")
if [ "$file_n" -lt 3 ] && [ "$api_n" != "?" ] && [ "$api_n" -lt 3 ]; then pass "Hall of Fame reset (file: $file_n, server: $api_n entries)"
else fail "Hall of Fame not reset (file: $file_n, server: $api_n entries)" "stop the server, then: mv server/data server/data.bak-\$(date +%Y%m%d-%H%M), start it again"; fi

# 7. VVD running and reachable over adb
# shellcheck disable=SC1090
source ~/vega/env >/dev/null 2>&1 || true
if vega virtual-device status 2>/dev/null | grep -q '"running":true' && adb devices 2>/dev/null | grep -qE '^emulator-5554\s+device'; then
  pass "VVD running (emulator-5554 online)"
else fail "VVD not running or not online in adb" "vega virtual-device start --no-gui --timeout 300, then reinstall the app"; fi

# 8. TV build is newer than every TV source file, committed or not.
# shortcut: the vpkg's time stands for the installed app (vbuild.sh --run builds and installs in one go); a hand
# install of an older vpkg is not caught.
vpkg=tv/build/sketchlings_aarch64.vpkg
if [ -f "$vpkg" ]; then
  built=$(stat -f %m "$vpkg")
  newer=$(find tv/src tv/assets tv/index.js tv/manifest.toml tv/package.json shared -newer "$vpkg" -type f 2>/dev/null | head -1)
  if [ -z "$newer" ]; then pass "TV build $(date -r "$built" '+%a %H:%M') is newer than its sources (tv/src, tv/assets, shared)"
  else fail "TV build $(date -r "$built" '+%a %H:%M') is older than $newer" "rebuild and install: tv/scripts/vbuild.sh release --run"; fi
else fail "No $vpkg" "build it: tv/scripts/vbuild.sh release --run"; fi

# 9. HTTPS tunnel (phones need a secure page for "Enable shouting"). The link is the last one tunnel.sh announced in
# the run sheet's logs (notes/playtest-<date>.log, notes/tunnel-run.log), read oldest file first
if pgrep -x cloudflared >/dev/null; then
  URL=$(ls -tr notes/playtest-*.log notes/tunnel-run.log 2>/dev/null | xargs cat 2>/dev/null |
    sed -nE 's#^Phones join at (https://[a-z0-9-]+\.trycloudflare\.com)/.*#\1#p' | tail -1)
  if [ -n "$URL" ] && curl -fsS -m 10 "$URL/health" >/dev/null 2>&1; then pass "HTTPS tunnel answers: $URL"
  else fail "cloudflared runs but the last link in notes/playtest-*.log (${URL:-none}) doesn't answer" "if phones can't join either: scripts/session.sh stop, then scripts/session.sh (every phone then rescans)"; fi
else fail "No HTTPS tunnel" "start the session with scripts/session.sh (with --lan there is no tunnel: this line FAILs)"; fi

# 10. Phone build is newer than its sources (the server serves phone/dist only)
if [ -f phone/dist/index.html ]; then
  stale=$(find phone/index.html phone/src packages/doodle-cutout/src shared -newer phone/dist/index.html -type f 2>/dev/null | head -1)
  if [ -z "$stale" ]; then pass "Phone build $(date -r "$(stat -f %m phone/dist/index.html)" '+%a %H:%M') is newer than its sources"
  else fail "Phone build is older than $stale" "cd phone && npm run build (no server restart; open phones reload their page)"; fi
else fail "No phone build (phone/dist)" "cd phone && npm run build"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASS: ready to film."; else echo "$FAILS FAIL(s): fix them before the family plays."; fi
[ "$FAILS" -eq 0 ]
