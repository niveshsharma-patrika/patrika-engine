# Patrika Engine

Editorial command centre for the Patrika newsroom. It watches ~40 Indian news
feeds, groups the same story across publishers, and surfaces three live feeds —
**Breaking**, **Trending**, and **Watching** — using **no AI for clustering**.

## What it does

Every few minutes it pulls the latest articles from RSS feeds, publisher
sitemaps, and Google News (English + Hindi), then groups them into "one pile =
one real-world story". A pile becomes a story the desk sees once **3 different
publishers** are in it.

| Feed | Shows | Rule |
|---|---|---|
| 🔴 **Breaking** | Just-broke stories | 3+ distinct publishers, reached the 3rd in the **last 30 min** |
| 📈 **Trending** | Developing stories | 3+ distinct publishers, broke **30 min – 4 h ago** |
| 👀 **Watching** | Almost-confirmed | exactly **2 publishers** (one outlet short of the bar), fresh in the last 4 h |

A story's age is measured from **`broke_at`** — the moment it reached 3 distinct
publishers — so the same row keeps its identity and clock as it grows across
ticks.

## Clustering — intelligent, no AI

Grouping is pure text math (`lib/clustering/lexical.ts`), no embeddings and no
LLM:

1. **Tokenise** each headline (English + Hindi), drop stop-words, keep the
   meaningful words.
2. **Weight features** — title words, keywords, and bi/tri-grams carry the most
   weight (they pin the specific event).
3. **Find candidate pairs** via an inverted index (feature → docs), so we never
   compare every article to every other.
4. **Decide "same story?"** with a multi-signal rule: cosine similarity + title
   overlap + strong-token overlap + shared phrase "anchors", with a
   same-publisher guard and a time-window guard.
5. **Union-Find** the linked pairs into clusters; gate to 3 distinct publishers.

It's "intelligent" (entities, weighting, multi-outlet agreement) but free, fast,
and fully explainable. The whole engine can run with **AI switched off** — it has
no AI to switch on by default.

## Services

- **Supabase** — Postgres database (the only thing you must set up).
- **Vercel** — hosting + the cron that runs the pipeline every 5 min (`vercel.json`).
- **News feeds** — RSS / sitemaps / Google News (free, public).

No paid AI services are used by the trend engine. (An optional "write a draft"
button can call Anthropic/OpenAI/Google/Groq, but it's off until you add a key.)

## Local setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

[supabase.com](https://supabase.com) → New project. From **Project Settings →
API**, copy the Project URL, the `anon` key, and the `service_role` key.

### 3. Run the migrations

Supabase Dashboard → **SQL Editor** → paste and run each file in
`supabase/migrations/` **in order** (`0001_…` first, `0021_…` last). They create
the tables, seed the default sources, and turn the no-AI clustering on.

### 4. Configure env

```bash
cp .env.example .env.local
```

Fill in the three `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` values. Nothing else is required.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. It'll be empty until the first ingest runs —
trigger one by hitting **`/api/cron/ingest`** (or the status badge in the UI).

## How the pipeline runs

`vercel.json` schedules `GET /api/cron/ingest` every 5 minutes. Each tick:

1. **fetch** — pull all active sources in parallel, URL-dedupe, insert new signals.
2. **enrich** — best-effort JSON-LD scrape for description / keywords / section.
3. **cluster** — lexical (no-AI) clustering → create / update trend rows.

All three stages are free and toggleable from the admin page (or via
`SKIP_FETCH=1` / `SKIP_CLUSTER=1`).

## Project layout

```
app/
├─ page.tsx                  ← dashboard: Breaking / Trending / Watching board
├─ api/trends/route.ts       ← the three time-window queries
└─ api/cron/ingest/route.ts  ← the 5-minute pipeline entry point

lib/
├─ clustering/
│  ├─ lexical.ts             ← the no-AI clustering engine (tokenise → cluster)
│  ├─ index.ts               ← orchestrator: load → cluster → persist trends
│  └─ section-gate.ts        ← rule-based filler filter (lifestyle, astrology…)
├─ ingest/index.ts           ← fetch + enrich + cluster orchestration
├─ sources/                  ← rss / sitemap-news / google-news fetchers
└─ supabase/{server,client}.ts

supabase/migrations/         ← run these in the SQL editor, in order
```

## Tuning

The knobs live in two places and are kept in sync:

- **Time windows + the 3-source bar** — `lib/clustering/index.ts`
  (`BREAKING_MAX_MIN`, `TRENDING_MAX_MIN`, `NEWS_PUBLISHER_BAR`,
  `MIN_TRACK_PUBLISHERS`) and the matching constants in `app/api/trends/route.ts`.
- **Clustering sensitivity** — `lib/clustering/lexical.ts` (`shouldLink` rule
  tiers, feature weights, stop-words, publisher aliases).

## Deploy to Vercel

```bash
vercel deploy
```

Set the same Supabase env vars in **Project → Settings → Environment Variables**.
The cron in `vercel.json` starts running automatically.
