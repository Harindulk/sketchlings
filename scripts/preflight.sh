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
else fail "Server not answering on port 8787" "start it: scripts/tunnel.sh 2>&1 | tee notes/tunnel-run.log"; fi

# 5. Claude key: present in server/.env (value never printed) and the newest server log's banner says Claude
if grep -qE '^ANTHROPIC_API_KEY=.+' server/.env 2>/dev/null; then pass "server/.env has an ANTHROPIC_API_KEY"
else fail "No ANTHROPIC_API_KEY in server/.env" "paste the key into server/.env and restart the server"; fi
log=$(ls -t notes/*.log 2>/dev/null | head -1)
banner=$([ -n "$log" ] && grep -E '^Personas:' "$log" | tail -1)
case "$banner" in
  "Personas: Claude"*) pass "Newest log ($log): ${banner%%,*}" ;;
  *) fail "Newest log (${log:-none}) does not say \"Personas: Claude\"" "start the server with its output in notes/*.log (runsheet step 2.4) and check the key" ;;
esac

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

# 8. TV build is not older than the last commit to tv/ or shared/
vpkg=tv/build/sketchlings_aarch64.vpkg
if [ -f "$vpkg" ]; then
  built=$(stat -f %m "$vpkg"); committed=$(git log -1 --format=%ct -- tv shared)
  dirty=$(git status --porcelain -- tv/src shared | wc -l | tr -d ' ')
  if [ "$built" -ge "$committed" ]; then pass "TV build $(date -r "$built" '+%a %H:%M') is newer than the last tv/shared commit ($dirty uncommitted files in tv/src, shared)"
  else fail "TV build $(date -r "$built" '+%a %H:%M') is older than the last tv/shared commit $(date -r "$committed" '+%a %H:%M')" "rebuild and install: tv/scripts/vbuild.sh release --run"; fi
else fail "No $vpkg" "build it: tv/scripts/vbuild.sh release --run"; fi

# 9. HTTPS tunnel (phones need a secure page for "Enable shouting")
if pgrep -x cloudflared >/dev/null; then pass "cloudflared tunnel running"
else fail "No HTTPS tunnel" "start the server with scripts/tunnel.sh (not bun run start)"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASS: ready to film."; else echo "$FAILS FAIL(s): fix them before the family plays."; fi
[ "$FAILS" -eq 0 ]
