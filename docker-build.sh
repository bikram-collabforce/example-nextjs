#!/usr/bin/env bash
set -euo pipefail

echo "==> Building Docker images..."
docker compose build

echo ""
echo "==> Build complete. Images:"
docker images --filter "reference=example-nextjs-*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo ""
echo "To start the app:  docker compose up"
echo "To start detached: docker compose up -d"
