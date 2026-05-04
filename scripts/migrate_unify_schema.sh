#!/bin/bash
#
# Migration: Move all tables to shigachat schema
#
# Ensures all application tables are in the shigachat schema, not public.
# This migration specifically moves qa_embedding from public to shigachat.
#
# Safe to run multiple times (idempotent).
#
# Usage:
#   ./scripts/migrate_unify_schema.sh
#

set -e

CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-shigachat-postgres}"
PG_HOST="${PG_HOST:-}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DATABASE="${PG_DATABASE:-shigachat}"

run_psql() {
    if [ -n "${PG_HOST}" ]; then
        export PGPASSWORD="${PG_PASSWORD:-}"
        psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" "$@"
    else
        docker exec "${CONTAINER_NAME}" psql -U "${PG_USER}" -d "${PG_DATABASE}" "$@"
    fi
}

echo "=== Migration: Unify all tables into shigachat schema ==="
echo ""

# Ensure shigachat schema exists
run_psql -c "
CREATE SCHEMA IF NOT EXISTS shigachat;
" > /dev/null

echo "Checking for tables in public schema..."

# Find all tables in public schema (excluding system tables)
TABLES=$(run_psql -t -A -c "
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE 'sql_%';
")

if [ -z "${TABLES}" ]; then
    echo "No tables found in public schema. All tables are already in shigachat schema."
else
    echo "Found tables in public schema. Moving to shigachat..."
    echo "${TABLES}" | while IFS= read -r table; do
        if [ -n "${table}" ]; then
            echo "  Moving: ${table}"
            run_psql -c "
ALTER TABLE public.\"${table}\" SET SCHEMA shigachat;
" > /dev/null
        fi
    done
    echo "All tables moved successfully."
fi

echo ""
echo "--- Current schema distribution ---"
run_psql -c "
SELECT schemaname, COUNT(*) as table_count
FROM pg_tables
WHERE schemaname IN ('public', 'shigachat')
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE 'sql_%'
GROUP BY schemaname
ORDER BY schemaname;
"

echo ""
echo "--- Tables in shigachat schema ---"
run_psql -c "
SELECT tablename FROM pg_tables
WHERE schemaname = 'shigachat'
ORDER BY tablename;
"

echo ""
echo "Migration complete."
