#!/usr/bin/env bash
# Rebuilds the tagged beat-* history from video/stages in a new folder, for the
# undo reveals. Every on-screen file matches its stage exactly at each tag.
# Usage: bash video/rebuild-history.sh [destination]   (default: ../mow-money-video)
set -euo pipefail
src=$(cd "$(dirname "$0")/.." && pwd)
dest=${1:-$src/../mow-money-video}
if [ -e "$dest" ]; then echo "$dest already exists" >&2; exit 1; fi
mkdir -p "$dest"
tar -C "$src" --exclude=./node_modules --exclude=./.git --exclude=./.next \
  --exclude='./frogbot.db*' --exclude=./.env -cf - . | tar -C "$dest" -xf -
cd "$dest"
cp .env.example .env
secret=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
node -e "const f='.env',s=require('fs');s.writeFileSync(f,s.readFileSync(f,'utf8').replace('YOUR_SECRET_HERE','$secret'))"
npm install --no-audit --no-fund
onscreen=(src/collections/Jobs.ts src/frogbot.config.ts "src/app/(frogbot)/custom.scss" src/agents/foreman.ts src/tools/jobs.ts)
git init -q
for tag in beat-5 beat-6a beat-6b beat-6c beat-6d beat-7a beat-7b beat-7c beat-8a beat-8b beat-9a beat-9b beat-9c beat-9d; do
  for f in "${onscreen[@]}"; do
    if [ -f "video/stages/$tag/$f" ]; then
      mkdir -p "$(dirname "$f")"
      cp "video/stages/$tag/$f" "$f"
    else
      rm -f "$f"
    fi
  done
  npx frogbot generate:types >/dev/null
  npx frogbot generate:importmap >/dev/null
  git add -A
  git commit -qm "$tag"
  git tag "$tag"
done
echo "Rebuilt the beat-* tags in $dest"
