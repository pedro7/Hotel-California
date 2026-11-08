#!/usr/bin/env bash
# Dumps the production database to ./backups/hotel-YYYYmmdd-HHMMSS.sql.gz.
# Run from anywhere on the server (see README, "Backups"). Old files are NOT
# deleted automatically: prune ./backups yourself from time to time.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
file="backups/hotel-$(date +%Y%m%d-%H%M%S).sql.gz"
compose=(docker compose --env-file .env.prod -f docker-compose.prod.yaml)

"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$file"
echo "Backup written to $file"
