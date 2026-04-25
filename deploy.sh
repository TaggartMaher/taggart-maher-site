#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

branch="$(git rev-parse --abbrev-ref HEAD)"
last_commit="$(git log -1 --pretty=format:'%h %s — %an, %ad' --date=short)"

echo "Branch:       $branch"
echo "Last commit:  $last_commit"
echo
read -r -p "Deploy this revision? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

exec pnpm exec tsx scripts/deploy.ts "$@"
