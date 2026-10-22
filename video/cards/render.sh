#!/usr/bin/env bash
# Renders card HTML to PNG with headless Chrome: exact 1920x1080 pixels, alpha kept where the page is transparent.
#   cards/render.sh                      all cards -> cards/<name>.png
#   cards/render.sh kpi impact           just those
#   cards/render.sh --hash <page.html> "<text>" 1056,594 out.png   one page with <text> as its #hash (used by build.mjs:
#                                        placeholder.html for missing footage, text.html for captions and tags)
# Uses Playwright's chrome-headless-shell when it is installed: the full Google Chrome app leaked about 1.4 GB per
# launch on this Mac, the shell exits clean in about 0.4 s and gives byte-identical PNGs. CHROME=... overrides both.
set -euo pipefail
cd "$(dirname "$0")"
SHELL_BIN="$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1 || true)"
CHROME="${CHROME:-${SHELL_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}}"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }
PROFILE="$(mktemp -d)"; trap 'rm -rf "$PROFILE"' EXIT

shot() { # <html> <w,h> <out.png> [hash]
  rm -f "$3"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size="$2" \
    --default-background-color=00000000 --virtual-time-budget=4000 --user-data-dir="$PROFILE" --no-first-run \
    --screenshot="$3" "file://$PWD/$1${4:+#$4}" >/dev/null 2>&1 || true
  [ -s "$3" ] || { echo "render failed: $1" >&2; exit 1; }
}

if [ "${1:-}" = "--hash" ]; then
  out="$5"; [[ "$out" = /* ]] || out="$OLDPWD/$out"
  shot "$2" "$4" "$out" "$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$3")"
  exit 0
fi

names=("$@")
[ ${#names[@]} -gt 0 ] || for f in *.html; do case "$f" in placeholder.html|text.html) ;; *) names+=("${f%.html}") ;; esac; done
for n in "${names[@]}"; do
  size=1920,1080; [ "$n" = clock ] && size=3000,660
  # Headless Chrome now and then paints a shorter viewport (bottom ~64 px cut off), so render until two shots agree.
  shot "$n.html" "$size" "$PROFILE/a.png"
  for try in 1 2 3; do
    shot "$n.html" "$size" "$PROFILE/b.png"
    cmp -s "$PROFILE/a.png" "$PROFILE/b.png" && break
    mv "$PROFILE/b.png" "$PROFILE/a.png"
    [ "$try" = 3 ] && { echo "render unstable: $n.html" >&2; exit 1; }
  done
  mv "$PROFILE/a.png" "$n.png"
  echo "cards/$n.png"
done
