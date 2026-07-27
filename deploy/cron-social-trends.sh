#!/usr/bin/env bash
# Crawls social feeds (Reddit + X) for trending items. Separate cron from the
# news, Twitter and social-sync jobs.
#
# Every 30 minutes, offset from the others:
#   23,53 * * * * /full/path/to/patrika-news-engine/deploy/cron-social-trends.sh
#
# Reads PORT + CRON_SECRET from the app's .env.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 200 "http://127.0.0.1:${PORT:-3007}/api/cron/social-trends" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
