#!/usr/bin/env bash
# Runs the ingest tick. Add to crontab every 5 minutes:
#   */5 * * * * /full/path/to/patrika-engine/deploy/cron-ingest.sh
#
# Reads PORT + CRON_SECRET from the app's .env so nothing secret lives in cron.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 290 "http://127.0.0.1:${PORT:-3007}/api/cron/ingest" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
