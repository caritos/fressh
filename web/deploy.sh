#!/bin/bash
set -e

source "$(dirname "$0")/../.env"

REMOTE_USER="$username"
REMOTE_HOST="$host"
REMOTE_DIR="$www"

echo "→ Deploying to $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='bun.log' \
  -e "sshpass -p '$password' ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no" \
  "$(dirname "$0")/" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

sshpass -p "$password" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no \
  "$REMOTE_USER@$REMOTE_HOST" \
  "loginctl enable-linger && cd $REMOTE_DIR && ~/.bun/bin/bun install --production && systemctl --user restart fressh"

echo "✓ Done — https://fressh.caritos.com"
