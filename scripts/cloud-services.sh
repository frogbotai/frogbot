#!/usr/bin/env bash
# Starts the test services a cloud session needs: scripts/cloud-services.sh mongodb postgres redis storage
# Each name is a profile of test/docker-compose.yml. Safe to run again. Cloud sessions only.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "cloud-services: not a cloud session; use docker compose -f test/docker-compose.yml --profile <name> up -d"
  exit 0
fi

[ "$#" -gt 0 ] || { echo "usage: scripts/cloud-services.sh <profile>... (mongodb postgres redis storage)" >&2; exit 2; }

root=$(cd "$(dirname "$0")/.." && pwd -P)

if ! docker info >/dev/null 2>&1; then
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || { echo "cloud-services: dockerd did not start; see /tmp/dockerd.log" >&2; exit 1; }
fi

profiles=()
for name in "$@"; do profiles+=(--profile "$name"); done

docker compose -f "$root/test/docker-compose.yml" "${profiles[@]}" up -d --wait --wait-timeout 120
