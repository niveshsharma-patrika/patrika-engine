#!/usr/bin/env bash
# Generates the day's rashifal (all 12 signs) with OpenAI and auto-pushes it to
# WordPress. Idempotent: if today's set already exists and is pushed, it no-ops;
# if it exists but the push failed, it only RE-PUSHES (never regenerates).
#
# Run just after midnight IST, with a retry/catch-up pass ~20 min later. The
# crontab time is in the VM's timezone — check with `timedatectl`. The content
# is always for the correct IST day regardless, but schedule it near IST midnight.
#   If the VM clock is IST:
#     0 0 * * *   /full/path/to/patrika-engine/deploy/cron-horoscope.sh
#     20 0 * * *  /full/path/to/patrika-engine/deploy/cron-horoscope.sh
#   If the VM clock is UTC (00:00 IST = 18:30 UTC):
#     30 18 * * * /full/path/to/patrika-engine/deploy/cron-horoscope.sh
#     50 18 * * * /full/path/to/patrika-engine/deploy/cron-horoscope.sh
#
# Reads PORT + CRON_SECRET from the app's .env.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 200 "http://127.0.0.1:${PORT:-3007}/api/cron/horoscope" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
