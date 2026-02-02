#!/bin/bash
#
# Migration: Add 'summary' column to threads table
#
# This column stores an incremental rolling summary (in English)
# of each thread's conversation. Used by the RAG pipeline to inject
# conversation context into prompts.
#
# Safe to run multiple times (idempotent).
#
# Usage:
#   ./scripts/migrate_add_summary.sh
#

set -e

CONTAINER_NAME="shigachat-postgres"
PG_USER="postgres"
PG_DATABASE="shigachat"

echo "=== Migration: Add summary column to threads ==="
echo ""

# Detect which schema the threads table lives in
SCHEMA=$(docker exec "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" -t -A -c "
SELECT schemaname FROM pg_tables WHERE tablename = 'threads' LIMIT 1;
")

if [ -z "${SCHEMA}" ]; then
    echo "ERROR: threads table not found in any schema."
    exit 1
fi

SCHEMA=$(echo "${SCHEMA}" | tr -d '[:space:]')
echo "Found threads table in schema: ${SCHEMA}"

# Check if summary column already exists
HAS_COLUMN=$(docker exec "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" -t -A -c "
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = '${SCHEMA}'
  AND table_name = 'threads'
  AND column_name = 'summary';
")

HAS_COLUMN=$(echo "${HAS_COLUMN}" | tr -d '[:space:]')

if [ "${HAS_COLUMN}" = "1" ]; then
    echo "Column 'summary' already exists. Nothing to do."
else
    echo "Adding column 'summary TEXT' to ${SCHEMA}.threads ..."
    docker exec "${CONTAINER_NAME}" \
        psql -U "${PG_USER}" -d "${PG_DATABASE}" -c "
ALTER TABLE ${SCHEMA}.threads ADD COLUMN summary TEXT;
"
    echo "Column added successfully."
fi

echo ""
echo "--- Current threads schema ---"
docker exec "${CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DATABASE}" -c "\d ${SCHEMA}.threads"

echo ""
echo "Migration complete."
