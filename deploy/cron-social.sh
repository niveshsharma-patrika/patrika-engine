#!/usr/bin/env bash
# Syncs tracked social accounts (competitor/agency pages). Separate cron from
# news + Twitter so it can never interfere with them.
#
# Hourly is plenty — social engagement accrues slowly and YouTube quota is
# finite. Offset from the other jobs:
#   17 * * * * /full/path/to/patrika-news-engine/deploy/cron-social.sh
#
# Reads PORT + CRON_SECRET from the app's .env.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 280 "http://127.0.0.1:${PORT:-3007}/api/cron/social" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
