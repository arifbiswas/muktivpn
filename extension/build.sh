#!/usr/bin/env bash
# Builds dist/chrome (Chrome, Edge, Brave, Opera, Vivaldi) and dist/firefox, plus zip files for store upload.
set -euo pipefail
cd "$(dirname "$0")"

[[ -f src/icons/icon128.png ]] || node tools/make-icons.mjs

rm -rf dist
for target in chrome firefox; do
  mkdir -p "dist/$target"
  cp -R src/. "dist/$target/"
  cp "manifest.$target.json" "dist/$target/manifest.json"
  cp "${SERVERS_JSON:-../servers.json}" "dist/$target/servers.json"   # bundled fallback free-server list
  (cd "dist/$target" && zip -qr "../muktivpn-$target.zip" .)
done
echo "Built:"
ls -1 dist
