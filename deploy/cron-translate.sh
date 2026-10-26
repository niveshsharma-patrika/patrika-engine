#!/usr/bin/env bash
# Recovery sweep for the Hindi → English translation API: resumes jobs that a
# restart interrupted and re-delivers callbacks WordPress didn't accept.
# Run every 5 minutes:
#   */5 * * * * /full/path/to/patrika-engine/deploy/cron-translate.sh
#
# Reads PORT + CRON_SECRET from the app's .env.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 280 "http://127.0.0.1:${PORT:-3007}/api/cron/translate" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
