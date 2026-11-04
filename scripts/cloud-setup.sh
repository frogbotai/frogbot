#!/usr/bin/env bash
# Prepares a Claude cloud session for FrogBot's ticket process. Safe to run again.
# Outside a cloud session (CLAUDE_CODE_REMOTE unset) it does nothing.
set -uo pipefail
shopt -s nullglob

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "cloud-setup: not a cloud session, nothing to do"
  exit 0
fi

root=$(cd "$(dirname "$0")/.." && pwd -P)
parent=$(dirname "$root")
status=0

# Prints the path of this session's checkout of frogbotai/<name>, if there is one.
checkout_of() {
  local dir url
  for dir in "$parent"/* "$HOME"/* /home/*/* /workspace/* /workspaces/*; do
    [ -e "$dir/.git" ] || continue
    url=$(git -C "$dir" remote get-url origin 2>/dev/null) || continue
    case "$url" in
      */frogbotai/"$1" | */frogbotai/"$1".git)
        (cd "$dir" && pwd -P)
        return 0
        ;;
    esac
  done
  return 1
}

# Makes <parent>/<link> point at the checkout of frogbotai/<name>, the layout `pnpm ticket` expects.
place() {
  local name=$1 link=$2 found
  found=$(checkout_of "$name") || { echo "cloud-setup: $name not attached, skipped"; return 0; }
  if [ "$found" = "$parent/$link" ] || [ "$(cd "$parent/$link" 2>/dev/null && pwd -P)" = "$found" ]; then
    echo "cloud-setup: $name at $parent/$link"
  elif [ -e "$parent/$link" ]; then
    echo "cloud-setup: $parent/$link exists and is not $name; leaving it" >&2
    status=1
  else
    ln -s "$found" "$parent/$link" && echo "cloud-setup: linked $parent/$link -> $found"
  fi
}

# 1. Ticket documents: the process repo sits beside this checkout and .idea links to it, as locally.
if git -C "$root/.idea" remote get-url origin 2>/dev/null | grep -q 'frogbotai/process'; then
  echo "cloud-setup: .idea is the process repo"
else
  if found=$(checkout_of process) || { [ -e "$parent/process" ] || git clone -q https://github.com/frogbotai/process "$parent/process"; }; then
    found=${found:-$parent/process}
    [ -e "$root/.idea" ] || [ -L "$root/.idea" ] && mv "$root/.idea" "$root/.idea.before-cloud-setup"
    ln -s "$found" "$root/.idea" && echo "cloud-setup: linked .idea -> $found"
  else
    echo "cloud-setup: can't reach frogbotai/process; attach it to the session or project" >&2
    status=1
  fi
fi
mkdir -p "$root/.idea/tmp"
git -C "$root/.idea" pull -q --ff-only 2>/dev/null || true

# 2. Sibling checkouts, where scripts/ticket.mjs and sidekick's .frogbot link look for them.
[ "$(basename "$root")" = "frogbot" ] || place frogbot frogbot
place sidekick sidekick
place platform platform

# 3. A local main for `pnpm ticket verify`, which diffs against it.
git -C "$root" fetch -q --depth=200 origin main:refs/remotes/origin/main || status=1
if [ "$(git -C "$root" branch --show-current)" != "main" ]; then
  git -C "$root" branch -f main refs/remotes/origin/main >/dev/null || status=1
fi

# 4. Node and dependencies.
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 24 ]; then
  echo "cloud-setup: node $(node --version) is older than the repo's >=24.21; the environment setup script installs 24" >&2
  status=1
fi
for dir in "$root" "$parent/sidekick" "$parent/platform"; do
  [ -f "$dir/package.json" ] || continue
  echo "cloud-setup: pnpm install in $dir"
  (cd "$dir" && pnpm install --frozen-lockfile --reporter=silent) || status=1
done

[ "$status" -eq 0 ] && echo "cloud-setup: ready" || echo "cloud-setup: finished with problems (above)" >&2
exit "$status"
