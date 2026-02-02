#!/bin/bash
#
# PostgreSQL full dump script for ShigaChat
#
# Dumps schema + data from the shigachat database to a SQL file.
# The dump can be restored to recreate the database from scratch.
#
# Usage:
#   ./scripts/dump_postgres.sh                  # default output: scripts/shigachat_dump.sql
#   ./scripts/dump_postgres.sh my_backup.sql    # custom output path
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_FILE="${1:-${SCRIPT_DIR}/shigachat_dump.sql}"
CONTAINER_NAME="shigachat-postgres"
PG_USER="postgres"
PG_DATABASE="shigachat"

echo "=== ShigaChat PostgreSQL Dump ==="
echo "Container: ${CONTAINER_NAME}"
echo "Database:  ${PG_DATABASE}"
echo "Output:    ${OUTPUT_FILE}"
echo ""

# Dump the full database (schema + data)
# --no-owner: omit ownership commands (portable across environments)
# --no-privileges: omit GRANT/REVOKE (portable)
# --clean: include DROP before CREATE for idempotent restores
# --if-exists: add IF EXISTS to DROP commands
docker exec "${CONTAINER_NAME}" \
    pg_dump -U "${PG_USER}" -d "${PG_DATABASE}" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    > "${OUTPUT_FILE}"

FILE_SIZE=$(du -h "${OUTPUT_FILE}" | cut -f1)
echo "Dump completed: ${OUTPUT_FILE} (${FILE_SIZE})"
echo ""

# Show table row counts for verification
echo "--- Row counts in dump source ---"
docker exec "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" -c "
SELECT schemaname || '.' || relname AS table_name,
       n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY schemaname, relname;
"

echo ""
echo "To restore from this dump:"
echo "  docker exec -i ${CONTAINER_NAME} psql -U ${PG_USER} -d ${PG_DATABASE} < ${OUTPUT_FILE}"
