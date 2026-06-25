#!/usr/bin/env bash
set -euo pipefail

# Copy data from the old Supabase Postgres into the new (Azure) Postgres.
#
#   SOURCE_URL   = Supabase direct connection string
#                  (Supabase Dashboard → Project Settings → Database → Connection string → URI)
#   DATABASE_URL = the new target Postgres (same value the app uses)
#
#   SOURCE_URL='postgres://...' DATABASE_URL='postgres://...' bash deploy/migrate-data.sh
#
# Run AFTER the target schema is loaded:  psql "$DATABASE_URL" -f deploy/schema.sql
#
# It copies per table using the TARGET's column list, so the dropped
# embedding/embedded_at columns are skipped automatically. `profiles` is NOT
# copied — there are no Supabase users; create the admin with create-admin.ts.

: "${SOURCE_URL:?set SOURCE_URL to the Supabase connection string}"
: "${DATABASE_URL:?set DATABASE_URL to the target Postgres}"

# Parents before children (FK-safe).
TABLES=(
  ai_providers ai_models ai_config
  sources trends watchlist
  signals drafts ai_usage
  style_guides style_guidelines style_samples
  pipeline_settings ingest_runs
  source_candidates source_denylist api_keys trend_searches
)

for t in "${TABLES[@]}"; do
  cols=$(psql "$DATABASE_URL" -tAc \
    "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position)
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='$t'")
  if [ -z "$cols" ]; then echo "skip $t (not in target schema)"; continue; fi
  echo "→ copying $t"
  psql "$SOURCE_URL" -c "\copy (SELECT $cols FROM public.$t) TO STDOUT" \
    | psql "$DATABASE_URL" -c "\copy public.$t ($cols) FROM STDIN"
done

echo "✓ data copy complete"
