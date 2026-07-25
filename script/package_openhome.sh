#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ABILITY_PARENT="$ROOT_DIR/openhome"
ABILITY_NAME="ctrl-snap-host"
OUTPUT_PATH="$ABILITY_PARENT/snappy-booth-host.zip"

command -v zip >/dev/null 2>&1 || {
  echo "Missing required command: zip" >&2
  exit 1
}

cd "$ABILITY_PARENT"
rm -f "$OUTPUT_PATH"
zip -q -r "$OUTPUT_PATH" "$ABILITY_NAME" \
  -x '*/__pycache__/*' '*.pyc' '*.env' '*.env.*' '.DS_Store'

if unzip -l "$OUTPUT_PATH" \
  | grep -E '(__pycache__|\.pyc|/\.env($|\.))' >/dev/null 2>&1; then
  echo "Unsafe generated file found in OpenHome archive." >&2
  exit 1
fi

echo "$OUTPUT_PATH"
