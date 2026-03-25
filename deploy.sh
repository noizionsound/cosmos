#!/bin/bash
# ─── COSMOS deploy to GitHub Pages ────────────────────────────────────────────
# Usage:  bash deploy.sh "your commit message"
# Pushes current cosmos/ folder to https://github.com/noizionsound/cosmos
# ──────────────────────────────────────────────────────────────────────────────

DEPLOY_DIR="$(dirname "$0")/../cosmos_deploy"
SRC_DIR="$(dirname "$0")"
MSG="${1:-update}"

if [ ! -d "$DEPLOY_DIR/.git" ]; then
  echo "ERROR: deploy repo not found at $DEPLOY_DIR"
  echo "Clone it first:  git clone https://github.com/noizionsound/cosmos.git $DEPLOY_DIR"
  exit 1
fi

echo "→ Syncing to deploy repo..."
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='cosmos_deploy' \
  --exclude='cosmos_backup_*' \
  "$SRC_DIR/" "$DEPLOY_DIR/"

echo "→ Committing: \"$MSG\""
cd "$DEPLOY_DIR"
git add -A
git commit -m "$MSG" || echo "(nothing to commit)"

echo "→ Pushing to GitHub Pages..."
git push origin main

echo "✓ Done — https://noizionsound.github.io/cosmos/"
