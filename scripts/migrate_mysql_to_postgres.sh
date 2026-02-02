#!/bin/bash
#
# MySQL -> PostgreSQL migration script using pgloader (Docker)
#
# Usage:
#   ./scripts/migrate_mysql_to_postgres.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ShigaChat MySQL -> PostgreSQL Migration ==="
echo "MySQL: mysql:3306/ShigaChat"
echo "PostgreSQL: shigachat-postgres:5432/shigachat"
echo ""

# Run pgloader in Docker with config file
docker run --rm \
    --platform linux/amd64 \
    --network shigachat_app-network \
    -v "${SCRIPT_DIR}/pgloader.load:/tmp/pgloader.load:ro" \
    dimitri/pgloader:latest \
    pgloader --verbose /tmp/pgloader.load

echo ""
echo "Migration completed successfully!"
