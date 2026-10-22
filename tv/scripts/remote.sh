#!/bin/bash
# Drive the Vega Virtual Device from the Mac (works headless).
#   scripts/remote.sh up|down|left|right|select|back|menu|playpause [count]   D-pad / remote keys
#   scripts/remote.sh shot <out.png>                                           screenshot
# Keys go through the dev-mode `inputd-cli` on the device; screenshots through the emulator console.
set -euo pipefail
ADB=${ADB:-adb} # the PATH adb (Homebrew), as vega uses: two adb versions kill each other's server
DEV=${DEV:-emulator-5554}
cmd=$1; shift || true
case "$cmd" in
  shot)
    out=${1:?out.png}; tmp=$(mktemp -d)
    "$ADB" -s "$DEV" emu screenrecord screenshot "$tmp" >/dev/null
    mv "$tmp"/*.png "$out"; rmdir "$tmp"; echo "$out" ;;
  *)
    case "$cmd" in
      up) k=KEY_UP;; down) k=KEY_DOWN;; left) k=KEY_LEFT;; right) k=KEY_RIGHT;;
      select|enter|ok) k=KEY_ENTER;; back) k=KEY_BACK;; menu) k=KEY_MENU;; playpause) k=KEY_PLAYPAUSE;;
      *) k=$cmd;;
    esac
    n=${1:-1}
    for _ in $(seq "$n"); do "$ADB" -s "$DEV" shell inputd-cli button_press "$k" >/dev/null; done ;;
esac
