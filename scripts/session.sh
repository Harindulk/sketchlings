#!/usr/bin/env bash
# One command for a playtest or filming day: TV, server, live view, and a recording of everything the TV shows.
#   scripts/session.sh               start (Ctrl-C stops it)
#   scripts/session.sh --lan         start without the tunnel: phones on the Mac's Wi-Fi, plain http, no shouting
#   scripts/session.sh stop          stop it from another tab (also cleans up after a session whose tab is gone)
#   scripts/session.sh take <name>   end the current chunk and record one unbroken chunk of up to 180 s named after
#                                    the take (the video's one-take rule); start the take once it says "Recording"
#   --dry-run                        prints each step instead of doing it (with start, --lan, stop or take)
# Start: keeps the Mac awake (caffeinate), boots the VVD headless if it is down, launches the installed app, starts
# the server through scripts/tunnel.sh, opens the live view full screen in its own Chrome window, records the VVD
# screen with its sound in 120 s chunks (video/capture.sh's settings; a crash loses at most one chunk), runs
# scripts/preflight.sh and prints the join link. If a session is already running it only prints its status.
# Stop: ends the recording cleanly, stops the server, tunnel and live view, lists the files. The VVD and app keep running.
# Files: video/clips/session-<YYYYMMDD-HHMM>/ vvd-<YYYYMMDD-HHMMSS>[-<take>].webm, server.log, recorder.log,
# live-view.log. The server log also goes to notes/playtest-<YYYYMMDD>.log (runsheet, cold-test.md) and, with the
# tunnel, notes/tunnel-run.log (preflight reads the link there).
# The emulator records one file at a time: while a session runs, use `take`, not video/capture.sh.
# ADB=... and SERIAL=... override the adb and device (as in video/capture.sh), CHUNK=... the chunk length (1-180 s).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
# the PATH adb (Homebrew), the same as vega, preflight and tv/scripts/remote.sh: two adb versions kill each other's server (F6)
ADB="${ADB:-$(command -v adb)}"
[ -x "$ADB" ] || ADB=/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb
export ADB # live-view.ts presses the remote keys with it
SERIAL="${SERIAL:-emulator-5554}"
APP=com.starfungames.sketchlings.main
VPKG=tv/build/sketchlings_aarch64.vpkg
CHUNK="${CHUNK:-120}" # seconds per chunk: a VVD or Mac crash loses at most one
TAKE=180              # the emulator's longest recording
PORT=8787
STATE=video/clips/.session
PROFILE="${TMPDIR:-/tmp}/sketchlings-live-view-chrome" # a Chrome of its own, so the owner's windows stay as they are
DIR=

usage() { sed -n '2,8p' "$0" >&2; exit 2; }
DRY=0 LAN=0 CMD=start NAME=
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --lan) LAN=1 ;;
    start | stop | take) CMD=$a ;;
    *) { [ "$CMD" = take ] && [ -z "$NAME" ] && NAME=$a; } || usage ;;
  esac
done
[[ "$CHUNK" =~ ^[0-9]+$ ]] && ((CHUNK >= 1 && CHUNK <= TAKE)) || usage

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
die() { printf 'ERROR %s\n' "$*" >&2; exit 1; }
dry() { [ "$DRY" = 1 ]; }
run() { if dry; then printf '  $ %s\n' "$*"; else "$@"; fi; }
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
pid() { cat "$STATE/$1.pid" 2>/dev/null; }
running() { local p; p=$(pid main); alive "$p" && ps -p "$p" -o command= | grep -q session.sh; }
listening() { lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
healthy() { curl -fsS -m "${2:-3}" "$1/health" 2>/dev/null | grep -q '"ok":true'; }
free_gb() { df -k "$1" | awk 'NR == 2 { printf "%d", $4 / 1048576 }'; }
spawn() { # spawn <name> <log> <cmd...>: run in the background and remember its pid
  local name=$1 log=$2; shift 2
  if dry; then printf '  $ %s >>%s &\n' "$*" "$log"; return; fi
  "$@" >>"$log" 2>&1 &
  echo $! >"$STATE/$name.pid"
}
tree() { local c; for c in $(pgrep -P "$1"); do tree "$c"; done; echo "$1"; }
killtree() { # TERM a process and all its children, KILL what is left after 5 s
  alive "${1:-}" || return 0
  local all left p
  all=$(tree "$1")
  kill $all 2>/dev/null
  for _ in 1 2 3 4 5; do
    left=; for p in $all; do alive "$p" && left="$left $p"; done
    [ -z "$left" ] && return 0
    sleep 1
  done
  kill -9 $left 2>/dev/null
}

# ---------- recording ----------
rlog() { say "$(date +%T) REC $*" | tee -a "$DIR/recorder.log"; }
settle() { # the emulator finishes a file after stop: wait until the newest chunk stops growing (max ~20 s)
  local f size last=-1
  f=$(ls -t "$DIR"/vvd-*.webm 2>/dev/null | head -1)
  [ -n "$f" ] || return 0
  for _ in $(seq 20); do
    size=$(stat -f %z "$f" 2>/dev/null || echo 0)
    [ "$size" -gt 0 ] && [ "$size" = "$last" ] && return 0
    last=$size
    sleep 1
  done
}
record() { # chunk after chunk until $STATE/stop appears; a failed start (VVD down, recorder busy) is retried every second
  local take name f out secs i fails=0 prev= full=0
  while [ ! -e "$STATE/stop" ]; do
    if [ "$(free_gb "$DIR")" -lt 3 ]; then # ~5 GB an hour: never fill the disk the server and the VVD write to
      [ "$full" = 0 ] && rlog "WARNING less than 3 GB free: recording paused until there is more room"
      full=1
      sleep 5
      continue
    fi
    [ "$full" = 1 ] && rlog "disk space is back: recording again"
    full=0
    take=$(cat "$STATE/take" 2>/dev/null)
    secs=$CHUNK
    [ -n "$take" ] && secs=$TAKE
    name=vvd-$(date +%Y%m%d-%H%M%S)${take:+-$take}.webm
    f=$ROOT/$DIR/$name # the emulator writes the file itself, so the path must be absolute
    [ -e "$f" ] && { sleep 1; continue; }
    if out=$("$ADB" -s "$SERIAL" emu screenrecord start --time-limit "$TAKE" --fps 30 "$f" 2>&1) && [[ "$out" != *KO* ]]; then
      rm -f "$STATE/take"
      echo "$name" >"$STATE/current"
      [ "$fails" -gt 0 ] && rlog "recording again after $fails failed tries"
      fails=0
      rlog "start $name${take:+ (take, up to $TAKE s)}"
      i=0
      while [ "$i" -lt "$secs" ] && [ ! -e "$STATE/stop" ] && [ ! -s "$STATE/take" ]; do
        sleep 1
        i=$((i + 1))
        [ "$i" = 30 ] && [ -n "$prev" ] && [ ! -s "$prev" ] && rlog "WARNING $(basename "$prev") is empty: is the VVD recording?"
      done
      "$ADB" -s "$SERIAL" emu screenrecord stop >/dev/null 2>&1
      rlog "stop  $name after $i s"
      prev=$f
    else
      fails=$((fails + 1))
      [ $((fails % 30)) = 1 ] && rlog "can't start a recording ($(printf '%s' "$out" | tr '\n' ' ' | cut -c1-100)); retrying every second (is the VVD up?)"
      sleep 1
    fi
  done
  settle
  : >"$STATE/rec.done"
}

# ---------- stop ----------
saved() { # list a session folder, with each chunk's length
  local f d n=0 total=0
  say "Saved in $1/:"
  for f in "$1"/*; do
    [ -e "$f" ] || continue
    d=
    if [[ "$f" == *.webm ]]; then
      d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null)
      if [[ "$d" =~ ^[0-9.]+$ ]]; then
        n=$((n + 1))
        total=$(awk -v a="$total" -v b="$d" 'BEGIN { print a + b }')
        d=$(printf '%.0f s' "$d")
      else d="no length (unfinished file?)"; fi
    fi
    printf '  %-36s %6s  %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)" "$d"
  done
  [ "$n" -gt 0 ] && say "$n recordings, $(awk -v t="$total" 'BEGIN { printf "%.1f", t / 60 }') min in all"
}
cleanup() { # stops what a session started; safe to run again, also from another tab after a crash
  local dir r boot
  dir=$(cat "$STATE/dir" 2>/dev/null)
  DIR=${dir:-$DIR}
  boot=$(sysctl -n kern.boottime | sed -E 's/^[{] sec = ([0-9]+).*/\1/') # "{ sec = N, usec = M } <date>"
  if [ -e "$STATE/main.pid" ] && [ "$(stat -f %m "$STATE/main.pid")" -lt "$boot" ]; then # its pids may be anyone's now
    rm -rf "$STATE"
    say "Old session state from before the last restart: removed, nothing killed."
    return 0
  fi
  say ""
  say "Stopping: the recording first (its last file takes a few seconds to finish)..."
  : >"$STATE/stop" 2>/dev/null
  r=$(pid rec)
  if alive "$r"; then for _ in $(seq 40); do alive "$r" || break; sleep 1; done; fi
  if [ -n "$r" ] && [ ! -e "$STATE/rec.done" ]; then # the loop died or hung: stop the emulator's recorder here
    killtree "$r"
    "$ADB" -s "$SERIAL" emu screenrecord stop >/dev/null 2>&1
    [ -n "$DIR" ] && settle
  fi
  killtree "$(pid server)"
  for _ in 1 2 3 4 5; do alive "$(pid tee)" || break; sleep 1; done # let the server's last lines reach the log
  killtree "$(pid live)"
  [ -e "$STATE/chrome" ] && pkill -f "user-data-dir=$PROFILE"
  killtree "$(pid caff)"
  rm -rf "$STATE"
  [ -n "$dir" ] && { rmdir "$dir" 2>/dev/null || saved "$dir"; }
  say "Stopped. The VVD and the app are still running."
}
on_exit() { trap '' INT TERM HUP; cleanup; } # a second Ctrl-C must not cut the stop short

stop_cmd() {
  if [ ! -d "$STATE" ]; then say "No session running."; return 0; fi
  if dry; then
    say "  would send TERM to the session (pid $(pid main)): it stops the recording, server, tunnel and live view"
    return 0
  fi
  local m d
  m=$(pid main)
  d=$(cat "$STATE/dir" 2>/dev/null)
  if running; then
    say "Stopping the session (pid $m); its tab shows the details..."
    kill -TERM "$m"
    for _ in $(seq 90); do alive "$m" || break; sleep 1; done
    if alive "$m"; then
      warn "the session did not stop in 90 s: stopping its parts from here"
      kill -9 "$m"
      cleanup
    elif [ -d "$d" ]; then saved "$d"; fi
  else
    say "The session's tab is gone: cleaning up after it."
    cleanup
  fi
}

take_cmd() {
  [[ "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] || usage
  if dry; then
    say "  would end the current chunk and record vvd-<YYYYMMDD-HHMMSS>-$NAME.webm for up to $TAKE s"
    return 0
  fi
  running || die "no session running: start one with scripts/session.sh"
  echo "$NAME" >"$STATE/take"
  for _ in $(seq 30); do [ -e "$STATE/take" ] || break; sleep 1; done
  if [ -e "$STATE/take" ]; then warn "the take has not started yet (VVD down?): it starts as soon as the recorder can"
  else say "Recording $(cat "$STATE/current") now: up to $TAKE s, or until the next take or stop."; fi
}

status() {
  say ""
  say "Session  $(cat "$STATE/dir" 2>/dev/null || echo "$DIR")/   (pid $(pid main || echo -))"
  say "Join     $(cat "$STATE/join" 2>/dev/null || echo '<link>')/j/<CODE>   (the code is on the TV, its QR has the whole link)"
  say "TV       live view http://localhost:8799/ in Chrome, full screen (over HDMI: mirror the Mac's display)"
  say "REC      $(cat "$STATE/current" 2>/dev/null || echo 'starting...')   (${CHUNK} s chunks, about 5 GB an hour, $(free_gb .) GB free)"
  say "Take     scripts/session.sh take <name>   (one unbroken chunk, up to $TAKE s)"
  say "Stop     Ctrl-C here, or scripts/session.sh stop in another tab"
}

# ---------- start ----------
start_cmd() {
  if running; then
    say "A session is already running:"
    status
    return 0
  fi
  if [ -d "$STATE" ]; then
    say "The last session did not stop cleanly: cleaning up first."
    dry || cleanup
  fi
  DIR=video/clips/session-$(date +%Y%m%d-%H%M)
  if ! dry; then
    mkdir -p "$DIR" "$STATE"
    echo $$ >"$STATE/main.pid"
    echo "$DIR" >"$STATE/dir"
    trap on_exit EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    trap 'exit 129' HUP
  fi
  say "Session folder: $DIR/"

  step "Keeping the Mac awake while the session runs"
  spawn caff /dev/null caffeinate -dis -w $$

  step "VVD (boots it headless if it is down)"
  # shellcheck disable=SC1090
  source ~/vega/env >/dev/null 2>&1 || true
  command -v vega >/dev/null || dry || die "vega not found (source ~/vega/env)"
  local booted=0 st launched=0 off base new old
  if dry || ! vega virtual-device status 2>/dev/null | grep -q '"running":true'; then
    dry || say "  not running: booting it (about 10 s)"
    run vega virtual-device start --no-gui --timeout 300 || die "the VVD did not start (notes/tv.md F5: free memory, then run this again)"
    booted=1
  else say "  running"; fi
  # the SDK's adb owns the adb server when none runs yet (preflight flags a server started by Unity's copy)
  command -v adb >/dev/null && run adb start-server
  if ! dry; then
    for _ in $(seq 60); do "$ADB" devices 2>/dev/null | grep -qE "^$SERIAL[[:space:]]+device" && break; sleep 1; done
    "$ADB" devices 2>/dev/null | grep -qE "^$SERIAL[[:space:]]+device" ||
      warn "$SERIAL is not online in adb: live-view keys won't reach the TV (runsheet section 6, Unity's adb)"
  fi
  [ "$booted" = 1 ] && run sleep 10 # "ready" comes before vega can see the device (tv/scripts/soak.mjs)

  step "App (launches the installed one if it is not running)"
  if dry; then
    run vega device is-app-running -a "$APP"
    st="not running"
  else st=$(vega device is-app-running -a "$APP" 2>&1) || st="not running ($st)"; fi
  if [[ "$st" == *"not running"* ]]; then
    for _ in 1 2 3; do
      run vega device launch-app -a "$APP" && { launched=1; break; }
      sleep 5
    done
    dry && say "  (if that fails 3 times and $VPKG exists: vega run-app $VPKG $APP -d VirtualDevice)"
    if [ "$launched" = 0 ] && [ -f "$VPKG" ]; then
      warn "launch failed: installing $VPKG (built $(date -r "$(stat -f %m "$VPKG")" '+%a %H:%M'))"
      run vega run-app "$VPKG" "$APP" -d VirtualDevice && launched=1
    fi
    [ "$launched" = 1 ] || warn "the app did not launch: vega run-app $VPKG $APP -d VirtualDevice"
  else say "  already running"; fi

  step "Server ($([ "$LAN" = 1 ] && echo "LAN: phones on this Mac's Wi-Fi" || echo 'HTTPS tunnel, scripts/tunnel.sh'))"
  [ -f phone/dist/index.html ] || warn "phone/dist is missing: cd phone && npm run build"
  [ -n "$(find phone/src -newer phone/dist/index.html -type f 2>/dev/null | head -1)" ] &&
    warn "phone/src has changes newer than phone/dist: cd phone && npm run build, then restart the session"
  local logs=("$DIR/server.log" "notes/playtest-$(date +%Y%m%d).log") cmd
  if [ "$LAN" = 1 ]; then
    cmd='cd server && exec bun run start'
    old=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null)
    [ -n "$old" ] && run kill $old && run sleep 1 # an old server on 8787, as scripts/tunnel.sh does
  else
    command -v cloudflared >/dev/null || dry || die "cloudflared not found: brew install cloudflared, or run with --lan"
    cmd='exec scripts/tunnel.sh'
    logs+=(notes/tunnel-run.log)
  fi
  if dry; then
    printf '  $ %s 2>&1 | tee -a %s &\n' "$cmd" "${logs[*]}"
    base='<link>'
  else
    off=$(cat "$DIR/server.log" 2>/dev/null | wc -c | tr -d ' ')
    bash -c 'echo $$ >"$0"; '"$cmd" "$STATE/server.pid" 2>&1 | tee -a "${logs[@]}" &
    echo $! >"$STATE/tee.pid"
    for _ in $(seq 90); do # the tunnel alone can take up to 60 s
      new=$(tail -c +$((off + 1)) "$DIR/server.log" 2>/dev/null)
      [[ "$new" == *"Sketchlings server on"* ]] && healthy "http://localhost:$PORT" && break
      sleep 1
      alive "$(pid server)" || die "the server stopped$([ "$LAN" = 1 ] || echo '; with no internet: scripts/session.sh --lan')"
    done
    healthy "http://localhost:$PORT" || die "the server did not answer on port $PORT in 90 s (see $DIR/server.log)"
    base=$(printf '%s\n' "$new" | grep -oE 'Phones join at [^ ]+' | tail -1 | sed -e 's/^Phones join at //' -e 's#/j/<CODE>$##')
    echo "$base" >"$STATE/join"
    if [ "$LAN" = 0 ]; then
      for _ in $(seq 10); do healthy "$base" 5 && break; sleep 2; done
      healthy "$base" 5 && say "  the tunnel answers: $base" ||
        warn "$base does not answer from this Mac yet: try it on a phone; if it fails there too, stop and run --lan"
    fi
  fi

  step "Live view, full screen in its own Chrome window"
  if dry || ! listening 8799; then spawn live "$DIR/live-view.log" bun scripts/live-view.ts; else say "  already running"; fi
  dry || for _ in $(seq 10); do listening 8799 && break; sleep 1; done
  if dry || ! pgrep -f "user-data-dir=$PROFILE" >/dev/null; then
    if [ -d "/Applications/Google Chrome.app" ]; then
      run open -na "Google Chrome" --args --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
        --start-fullscreen --app=http://localhost:8799/
      dry || : >"$STATE/chrome"
    else
      run open http://localhost:8799/
      say "  click once on the page for full screen"
    fi
  else say "  its window is already open"; fi

  step "Recording the VVD screen and sound in $CHUNK s chunks"
  if dry; then
    printf '  $ %s -s %s emu screenrecord start --time-limit %s --fps 30 %s/%s/vvd-<YYYYMMDD-HHMMSS>.webm\n' "$ADB" "$SERIAL" "$TAKE" "$ROOT" "$DIR"
    printf '  $ %s -s %s emu screenrecord stop   (after %s s, then the next chunk)\n' "$ADB" "$SERIAL" "$CHUNK"
  else
    record &
    echo $! >"$STATE/rec.pid"
  fi

  step "Preflight"
  run scripts/preflight.sh
  [ "$LAN" = 1 ] && say "(--lan: no HTTPS tunnel, so its tunnel line FAILs)"

  status
  dry && return 0
  local srv=up tun=up
  while :; do # watch the server and the tunnel; say so only when one changes
    sleep 20 &
    wait $!
    if ! alive "$(pid server)"; then
      [ "$srv" = up ] && warn "the server stopped: phones can't play. Stop this session and start it again."
      srv=down
      continue
    fi
    [ "$LAN" = 1 ] && continue
    if healthy "$base" 10; then
      [ "$tun" = down ] && say "OK    $base answers again"
      tun=up
    else
      [ "$tun" = up ] && warn "$base does not answer from this Mac. If phones can't join: stop, then scripts/session.sh --lan"
      tun=down
    fi
  done
}

case "$CMD" in
  start) start_cmd ;;
  stop) stop_cmd ;;
  take) take_cmd ;;
esac
