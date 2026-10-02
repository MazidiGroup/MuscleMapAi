#!/usr/bin/env bash
# Dev-only: re-export the app icon PNGs from the two brand SVGs.
#
#   logo-icon.svg (chevron on the warm radial ground) -> icon.png, splash-image.png, favicon.png
#   logo-mark.svg (chevron on transparent)            -> adaptive-icon.png (Android foreground)
#
# Uses macOS `sips`, which rasterises SVG natively, so nothing is added to
# package.json. Run from anywhere: `bash frontend/scripts/export-brand-icons.sh`.
set -euo pipefail

if ! command -v sips >/dev/null 2>&1; then
  echo "export-brand-icons: needs macOS sips" >&2
  exit 1
fi

IMAGES="$(cd "$(dirname "$0")/../assets/images" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() { # <svg> <size> <out.png>
  sips -s format png "$IMAGES/$1" --out "$TMP/render.png" >/dev/null
  sips -z "$2" "$2" "$TMP/render.png" --out "$IMAGES/$3" >/dev/null
  echo "  $3 (${2}x${2}) <- $1"
}

echo "export-brand-icons:"
render logo-icon.svg 1024 icon.png
render logo-icon.svg 1024 splash-image.png
render logo-icon.svg 200 favicon.png
render logo-mark.svg 1024 adaptive-icon.png
