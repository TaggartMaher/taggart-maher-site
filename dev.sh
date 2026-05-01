#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
cargo run --quiet --release --manifest-path scripts/bake-textures/Cargo.toml
exec pnpm dev "$@"
