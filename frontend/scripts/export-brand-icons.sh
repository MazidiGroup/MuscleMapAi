#!/usr/bin/env bash
# Dev-only: re-export every icon PNG from the brand SVGs (macOS `sips`, which
# rasterises SVG natively — nothing is added to package.json).
#
#   assets/images/logo-icon.svg        -> icon.png, splash-image.png, favicon.png
#   assets/images/logo-mark.svg        -> adaptive-icon.png (splash, LoadingScreen, Android foreground)
#   targets/watch/watch-icon-source.svg -> watch AppIcon.png, flattened to no alpha
#
# Run from anywhere: `bash frontend/scripts/export-brand-icons.sh`.
set -euo pipefail
command -v sips >/dev/null || { echo "export-brand-icons: needs macOS sips" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGES="$ROOT/assets/images"
WATCH="$ROOT/targets/watch"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

render() { # <svg> <size> <out.png>
  sips -s format png "$1" --out "$TMP/r.png" >/dev/null
  sips -z "$2" "$2" "$TMP/r.png" --out "$3" >/dev/null
  echo "  $(basename "$3") (${2}x${2}) <- $(basename "$1")"
}

echo "export-brand-icons:"
render "$IMAGES/logo-icon.svg" 1024 "$IMAGES/icon.png"
render "$IMAGES/logo-icon.svg" 1024 "$IMAGES/splash-image.png"
render "$IMAGES/logo-icon.svg" 200 "$IMAGES/favicon.png"
render "$IMAGES/logo-mark.svg" 1024 "$IMAGES/adaptive-icon.png"
# watchOS rejects an icon with an alpha channel: round-trip through JPEG to flatten.
render "$WATCH/watch-icon-source.svg" 1024 "$TMP/watch.png"
sips -s format jpeg -s formatOptions 100 "$TMP/watch.png" --out "$TMP/watch.jpg" >/dev/null
sips -s format png "$TMP/watch.jpg" --out "$WATCH/Assets.xcassets/AppIcon.appiconset/AppIcon.png" >/dev/null
echo "  AppIcon.png (1024x1024, no alpha) <- watch-icon-source.svg"
