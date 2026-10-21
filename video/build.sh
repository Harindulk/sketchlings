#!/usr/bin/env bash
# Assembles the Sketchlings demo video from edl.json (see README.md).
#   ./build.sh                          -> out/sketchlings.mp4 (placeholders for anything not filmed yet)
#   ./build.sh out/draft.mp4            -> another output name
#   FINAL=1 ./build.sh                  -> fail instead of using placeholders or draft TTS
#   KEEP=1 ./build.sh                   -> keep out/tmp (per-segment clips, mix.wav) for debugging
set -euo pipefail
cd "$(dirname "$0")"
for tool in ffmpeg ffprobe node; do command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }; done
exec node build.mjs "$@"
