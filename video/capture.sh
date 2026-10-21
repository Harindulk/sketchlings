#!/usr/bin/env bash
# Records the Vega Virtual Device screen to clips/<name>.webm (1920x1080 VP9, 30 fps, no audio) with the
# emulator's own recorder, then waits for the file and prints its length.
#   ./capture.sh <name> <seconds>          e.g. ./capture.sh takeB-vvd 60   (1-180 s)
# Ctrl-C stops the recording early. ADB=... and SERIAL=... override the defaults below.
set -euo pipefail
cd "$(dirname "$0")"
ADB="${ADB:-/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb}"
SERIAL="${SERIAL:-emulator-5554}"
usage() { echo "usage: ./capture.sh <name> <seconds>   (name: letters, digits, . _ -; seconds: 1-180)" >&2; exit 2; }

name="${1:-}"; secs="${2:-}"
[[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || usage
[[ "$secs" =~ ^[0-9]+$ ]] && (( 10#$secs >= 1 && 10#$secs <= 180 )) || usage
[ -x "$ADB" ] || { echo "adb not found at $ADB (set ADB=...)" >&2; exit 1; }
mkdir -p clips
out="$PWD/clips/$name.webm" # the emulator writes the file itself, so the path must be absolute
[ -e "$out" ] && { echo "clips/$name.webm exists: delete it or pick another name" >&2; exit 1; }

stop() { "$ADB" -s "$SERIAL" emu screenrecord stop >/dev/null 2>&1 || true; }
trap 'echo; echo "stopping..."; stop' INT TERM

echo "Recording $secs s from $SERIAL -> clips/$name.webm"
"$ADB" -s "$SERIAL" emu screenrecord start --time-limit "$secs" --fps 30 "$out"
sleep "$secs" || true
trap - INT TERM

# The emulator finishes writing after the time limit: wait until the file stops growing (max ~20 s).
last=-1
for _ in $(seq 1 20); do
  size=$(stat -f %z "$out" 2>/dev/null || echo 0)
  [ "$size" -gt 0 ] && [ "$size" = "$last" ] && break
  last=$size; sleep 1
done
[ -s "$out" ] || { echo "no recording at clips/$name.webm (is the VVD running? try: $ADB devices)" >&2; exit 1; }
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of compact=nk=0 "$out"
