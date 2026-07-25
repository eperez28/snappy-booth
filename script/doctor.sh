#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FULL_CHECK="${1:-}"

cd "$ROOT_DIR"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "PASS: $1"
}

for command_name in git node npm python3; do
  command -v "$command_name" >/dev/null 2>&1 \
    || fail "missing command: $command_name"
done

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22 or newer is required"
pass "Node.js $(node --version)"

for required_path in \
  package-lock.json \
  Package.swift \
  app/Booth.tsx \
  Sources/CTRLSnap/CTRLSnapApp.swift \
  openhome/ctrl-snap-host/background.py \
  skills/snappy-booth-setup/SKILL.md; do
  [[ -e "$required_path" ]] || fail "missing $required_path"
done
pass "all three monorepo components are present"

if git ls-files | grep -E '(^|/)\.env($|\.)' >/dev/null 2>&1; then
  fail "an environment file is tracked"
fi
pass "no environment files are tracked"

TRACKED_KEY_PATTERN='(sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})'
if git grep -n -I -E "$TRACKED_KEY_PATTERN" -- . \
  ':(exclude)script/doctor.sh' >/dev/null 2>&1; then
  fail "a key-shaped value is present in tracked files"
fi
pass "no key-shaped value is present in tracked files"

if git log --all -p -- . \
  | grep -E "$TRACKED_KEY_PATTERN" \
  >/dev/null 2>&1; then
  fail "a key-shaped value is present in Git history"
fi
pass "no key-shaped value is present in reachable Git history"

python3 -m py_compile \
  openhome/ctrl-snap-host/main.py \
  openhome/ctrl-snap-host/background.py \
  openhome/ctrl-snap-host/devkit_functions.py
pass "OpenHome Python sources compile"

if [[ "$FULL_CHECK" == "--full" ]]; then
  command -v swift >/dev/null 2>&1 || fail "Swift is required for --full"
  npm run lint
  npm test
  npm run build:mac-web
  swift build
  pass "full web and native builds completed"
elif [[ -n "$FULL_CHECK" ]]; then
  fail "usage: ./script/doctor.sh [--full]"
fi

echo "Snappy Booth doctor completed successfully."
