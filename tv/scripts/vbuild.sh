#!/bin/bash
# Build (and optionally install + launch) the TV app from a mirror path WITHOUT spaces.
# Why: the Vega build shells out unquoted (kepler-compatibility-metro-config execSync), so a project under
# "~/Library/Application Support/..." fails with "/bin/sh: /Users/.../Library/Application: No such file or directory".
# Usage: scripts/vbuild.sh [release|debug] [--run]      env: VBUILD_DIR (default $TMPDIR/sketchlings-vbuild),
#        MUTE=1 builds with sound off (automated tests: the VVD plays audio through the Mac's speakers),
#        ROOM=BNDR builds a soak-only TV that always opens room BNDR
set -euo pipefail
TYPE=${1:-release}
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(dirname "$HERE")"
DEST="${VBUILD_DIR:-${TMPDIR:-/tmp}/sketchlings-vbuild}"
case "$DEST" in *" "*) echo "VBUILD_DIR must not contain spaces"; exit 1;; esac
mkdir -p "$DEST/sketchlings"
rsync -a --delete --exclude /build "$HERE/" "$DEST/sketchlings/tv/"
rsync -a --delete "$ROOT/shared/" "$DEST/sketchlings/shared/"
if [ "${MUTE:-0}" = 1 ]; then sed -i '' 's/export const SOUND = true/export const SOUND = false/' "$DEST/sketchlings/tv/src/config.ts"; fi
# ROOM=BNDR: soak-only build whose TV asks for that room code (soak.mjs --live N --room BNDR; Vision can't read the tiles)
# AUDIOSOAK=1: test-only build that runs src/AudioSoak.tsx (Reveal/Results audio on a loop) instead of the game
if [ "${AUDIOSOAK:-0}" = 1 ]; then sed -i '' "s#import { App } from './src/App';#import { AudioSoak as App } from './src/AudioSoak';#" "$DEST/sketchlings/tv/index.js"; grep -q AudioSoak "$DEST/sketchlings/tv/index.js"; fi
if [ -n "${ROOM:-}" ]; then sed -i '' "s/\.\.\.(code.current ? {room: code.current} : {}),/room: code.current ?? '$ROOM',/" "$DEST/sketchlings/tv/src/game/party.ts"; grep -q "?? '$ROOM'" "$DEST/sketchlings/tv/src/game/party.ts"; fi
source ~/vega/env
cd "$DEST/sketchlings/tv"
if [ "$TYPE" = debug ]; then npm run build:debug; else npm run build:release; fi
mkdir -p "$HERE/build"
VPKG=$(ls build/aarch64-$TYPE/*.vpkg | head -1)
cp "$VPKG" "$HERE/build/"
echo "Built $VPKG (copied to tv/build/)"
if [ "${2:-}" = --run ]; then
  vega run-app "$VPKG" com.starfungames.sketchlings.main -d VirtualDevice
fi
