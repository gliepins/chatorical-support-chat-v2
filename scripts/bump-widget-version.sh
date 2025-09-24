#!/usr/bin/env sh
set -eu

# Bumps the cache-busted widget version across all stage HTML files.
# Usage:
#   scripts/bump-widget-version.sh                 # uses current repo commit and timestamp
#   WIDGET_VERSION=202509241530-deadbeef scripts/bump-widget-version.sh
# Optional env:
#   STAGE_ROOT=/var/www/stage                      # root directory to scan for *.html
#   REPO_ROOT=/home/ubuntu/v2-support-chat         # repo to read commit from

STAGE_ROOT=${STAGE_ROOT:-/var/www/stage}
REPO_ROOT=${REPO_ROOT:-/home/ubuntu/v2-support-chat}

if [ -z "${WIDGET_VERSION:-}" ]; then
  TS=$(date +%Y%m%d%H%M)
  SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
  WIDGET_VERSION="${TS}-${SHA}"
fi

FILES=$(grep -RIl --include='*.html' '/widget.js?v' "$STAGE_ROOT" 2>/dev/null || true)
COUNT=$(printf "%s\n" "$FILES" | grep -c . 2>/dev/null || true)
if [ "$COUNT" -eq 0 ]; then
  echo "No HTML files with /widget.js?v found under $STAGE_ROOT"
  exit 0
fi

echo "Updating $COUNT file(s) to /widget.js?v=${WIDGET_VERSION}"
printf "%s\n" "$FILES" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  sudo -n sed -i -E "s#/widget\\.js\\?v[^\"']*#/widget.js?v=${WIDGET_VERSION}#g" "$f"
done
echo "Done."


