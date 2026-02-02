#!/bin/bash
#
# PostgreSQL restore script for ShigaChat
#
# Restores a dump file created by dump_postgres.sh into the PostgreSQL database.
# WARNING: This will DROP all existing tables before restoring.
#
# Usage:
#   ./scripts/restore_postgres.sh                    # restore from scripts/shigachat_dump.sql
#   ./scripts/restore_postgres.sh backup_file.sql    # restore from custom file
#   ./scripts/restore_postgres.sh --confirm backup_file.sql  # skip confirmation prompt
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_NAME="shigachat-postgres"
PG_USER="postgres"
PG_DATABASE="shigachat"

# Parse arguments
SKIP_CONFIRM=0
DUMP_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --confirm|-y)
            SKIP_CONFIRM=1
            shift
            ;;
        *)
            DUMP_FILE="$1"
            shift
            ;;
    esac
done

# Default to scripts/shigachat_dump.sql if no file specified
if [ -z "${DUMP_FILE}" ]; then
    DUMP_FILE="${SCRIPT_DIR}/shigachat_dump.sql"
fi

# Check if dump file exists
if [ ! -f "${DUMP_FILE}" ]; then
    echo "ERROR: Dump file not found: ${DUMP_FILE}"
    echo ""
    echo "Usage:"
    echo "  ./scripts/restore_postgres.sh [--confirm] [dump_file.sql]"
    exit 1
fi

echo "=== ShigaChat PostgreSQL Restore ==="
echo "Container:  ${CONTAINER_NAME}"
echo "Database:   ${PG_DATABASE}"
echo "Dump file:  ${DUMP_FILE}"
echo ""

FILE_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "File size: ${FILE_SIZE}"
echo ""

# Confirmation prompt (unless --confirm flag was passed)
if [ "${SKIP_CONFIRM}" -eq 0 ]; then
    echo "WARNING: This will DROP all existing tables and data in the database."
    echo "Make sure you have a backup if you need to preserve current data."
    echo ""
    read -p "Continue with restore? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

echo "Starting restore..."
echo ""

# Restore the dump
# The dump file includes DROP statements, so existing schema will be replaced
docker exec -i "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" \
    < "${DUMP_FILE}" \
    2>&1 | grep -v "^DROP" | grep -v "^CREATE" | grep -v "^ALTER" | grep -v "^COPY" | head -20

echo ""
echo "Restore completed."
echo ""

# Show table row counts for verification
echo "--- Row counts after restore ---"
docker exec "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" -c "
SELECT schemaname || '.' || relname AS table_name,
       n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY schemaname, relname;
"

echo ""
echo "Restore verification complete."
