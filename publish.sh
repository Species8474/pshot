#!/usr/bin/env bash
# Build and copy only the servable files into public/ (served by tailscale serve on :8830).
set -euo pipefail
cd "$(dirname "$0")"
npm run build
mkdir -p public
rsync -a --delete --exclude='*.map' index.html dist images public/
