#!/usr/bin/env bash
# Runs the Twitter/X crawl tick — SEPARATE from the news ingest cron.
#
# Offset from the news tick so the two never fire in the same second and
# compete for CPU on the VM (news runs at */5, this at 2-59/5):
#   2-59/5 * * * * /full/path/to/patrika-engine/deploy/cron-twitter.sh
#
# Tier decides how often each account is actually crawled (5 / 30 / 120 min);
# this tick just asks "who is due?", so running it every 5 minutes is cheap.
#
# Reads PORT + CRON_SECRET from the app's .env so nothing secret lives in cron.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 240 "http://127.0.0.1:${PORT:-3007}/api/cron/twitter" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
