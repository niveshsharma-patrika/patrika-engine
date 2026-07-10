#!/usr/bin/env bash
set -euo pipefail

# Copy the CONFIG + CONTENT tables from the old Supabase Postgres into the new
# Azure Postgres. Uses psql \copy (client-side COPY) — no pg_dump, so there is
# NO client/server version dependency; it works across Postgres major versions.
#
# What it copies (everything that does NOT regenerate on its own), FK-safe order:
#   ai_providers → ai_models → ai_config    AI model routing + system prompts
#   sources                                 your RSS / Google-News feeds (~137)
#   style_samples, style_guidelines         per-publication writing style
#   pipeline_settings                       ingest feature toggles
#   source_candidates, source_denylist      source-discovery state
#
# Deliberately NOT copied:
#   trends, signals        — the live news; the ingest cron rebuilds these fresh
#                            (copying them would just show stale, hours-old news)
#   drafts, ai_usage       — reference old users/trends we don't carry over
#   style_guides           — file links point at Supabase Storage (dead here)
#   ingest_runs, trend_searches, watchlist — run history / removed feature
#   profiles               — users are recreated natively via the admin UI
#
# Assumes the target tables were freshly loaded and are EMPTY (schema.sql, no
# data). To re-run cleanly, TRUNCATE the tables below first.
#
# Usage (from anywhere on the server):
#   bash ~/patrika-news-engine/deploy/migrate-data.sh
# It reads DATABASE_URL from the app's .env and prompts (hidden) for the
# Supabase connection URI. SSL is forced for both ends.

cd "$(dirname "$0")/.."

# Target = the app's own database (read from .env). Source = Supabase (prompted).
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- \
                 | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
fi
: "${DATABASE_URL:?could not read DATABASE_URL from .env}"

if [ -z "${SOURCE_URL:-}" ]; then
  read -r -s -p "Supabase connection URI (Session pooler, port 5432): " SOURCE_URL
  echo
fi
: "${SOURCE_URL:?SOURCE_URL (the Supabase connection URI) is required}"

# Encrypt both connections; require (not verify-full) matches how the app connects.
export PGSSLMODE="${PGSSLMODE:-require}"

TABLES=(
  ai_providers ai_models ai_config
  sources
  style_samples style_guidelines
  pipeline_settings
  source_candidates source_denylist
)

echo "── copying ${#TABLES[@]} tables, Supabase → Azure ──"
for t in "${TABLES[@]}"; do
  # Use the TARGET's column list so any source-only columns are ignored and the
  # order always matches the destination.
  cols=$(psql "$DATABASE_URL" -tAc \
    "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position)
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='$t'")
  if [ -z "$cols" ]; then echo "  skip $t (not in target schema)"; continue; fi
  psql "$SOURCE_URL"     -c "\copy (SELECT $cols FROM public.$t) TO STDOUT" \
    | psql "$DATABASE_URL" -c "\copy public.$t ($cols) FROM STDIN"
  n=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM public.$t")
  printf "  ✓ %-20s %s rows\n" "$t" "$n"
done

echo "✓ data copy complete"
