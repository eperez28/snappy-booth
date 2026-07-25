#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENHOME_VENV="$ROOT_DIR/.venv-openhome"

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command npm
require_command python3

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 22 )); then
  echo "Snappy Booth requires Node.js 22 or newer; found $(node --version)." >&2
  exit 1
fi

echo "Installing locked web dependencies..."
npm ci

echo "Preparing the OpenHome validation environment..."
python3 -m venv "$OPENHOME_VENV"
"$OPENHOME_VENV/bin/python" -m pip install --disable-pip-version-check \
  -r "$ROOT_DIR/openhome/ctrl-snap-host/requirements.txt"

echo "Running quick checks..."
"$ROOT_DIR/script/doctor.sh"

echo
echo "Snappy Booth is ready."
echo "  Chrome:      npm run dev"
echo "  LAN + QR:    npm run dev:lan"
echo "  Native Mac:  ./script/build_and_run.sh"
echo "  OpenHome:    ./script/package_openhome.sh"
