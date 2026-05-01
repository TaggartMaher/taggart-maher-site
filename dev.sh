#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
echo "[dev] skipping asset bake — run ./build.sh if public/composite/* is stale" >&2
exec pnpm dev "$@"
