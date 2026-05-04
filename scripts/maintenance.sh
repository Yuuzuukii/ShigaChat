#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "$#" -eq 0 ]; then
  cat <<'USAGE'
Usage:
  ./scripts/maintenance.sh scrape [scrape_inject.py options]
  ./scripts/maintenance.sh dump [output.sql]
  ./scripts/maintenance.sh restore [--confirm] [dump.sql]
  ./scripts/maintenance.sh migrate-unify-schema
  ./scripts/maintenance.sh shell

Examples:
  ./scripts/maintenance.sh scrape --skip-vector
  ./scripts/maintenance.sh scrape --skip-backup
  ./scripts/maintenance.sh dump /app/backup/manual.sql
  ./scripts/maintenance.sh restore --confirm /app/backup/manual.sql
USAGE
  exit 1
fi

if [ ! -f "${PROJECT_ROOT}/.env.maintenance" ]; then
  echo "ERROR: .env.maintenance not found."
  echo "Copy .env.maintenance.example to .env.maintenance and set maintenance DB credentials."
  exit 1
fi

command_name="$1"
shift

case "${command_name}" in
  scrape)
    exec docker compose --profile tools run --rm maintenance python3 scrape_inject.py "$@"
    ;;
  dump)
    exec docker compose --profile tools run --rm maintenance bash dump_postgres.sh "$@"
    ;;
  restore)
    exec docker compose --profile tools run --rm maintenance bash restore_postgres.sh "$@"
    ;;
  migrate-unify-schema)
    exec docker compose --profile tools run --rm maintenance bash migrate_unify_schema.sh "$@"
    ;;
  shell)
    exec docker compose --profile tools run --rm maintenance bash "$@"
    ;;
  *)
    echo "ERROR: unknown maintenance command: ${command_name}"
    echo "Run without arguments to show usage."
    exit 1
    ;;
esac
