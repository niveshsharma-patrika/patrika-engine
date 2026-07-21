#!/usr/bin/env bash
# Writes articles for newly captured tweets.
#
# SEPARATE from both the news ingest cron and the Twitter crawl cron:
#   - never near the news pipeline (isolation),
#   - and apart from the crawl, so one slow web-search generation cannot stall
#     tweet capture.
#
# Every 15 minutes, offset from the other two jobs:
#   7-59/15 * * * * /full/path/to/patrika-news-engine/deploy/cron-twitter-draft.sh
#
# How many articles each run writes is capped in Twitter → Settings
# (per_run_cap), with a daily cap on top, so this can never run away.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
curl -s -m 290 "http://127.0.0.1:${PORT:-3007}/api/cron/twitter-draft" \
  -H "Authorization: Bearer ${CRON_SECRET}" >/dev/null 2>&1
