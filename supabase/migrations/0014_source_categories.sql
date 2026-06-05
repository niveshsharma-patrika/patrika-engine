-- ═══════════════════════════════════════════════════════════════
-- Source categorisation — two orthogonal tags per source.
--
-- focus    — what the publisher specialises in. Most Indian whole-publisher
--            sitemaps cover everything → 'general'. Specialists get their
--            domain: 'business' (Mint, ET, Moneycontrol), 'magazine'
--            (The Wire, Caravan), 'regional' (Deccan Chronicle, Mathrubhumi).
--
-- language — primary language served. 'en' / 'hi' / 'bilingual'.
--
-- Why two tags: a single category collapses too much information. A
-- regional Hindi paper and a business-specialist English paper are very
-- different things even though both are non-general.
--
-- Used by:
--   • /sources page — group/filter sources visually
--   • Discovery service (Phase 2) — auto-tag adopted candidates
-- ═══════════════════════════════════════════════════════════════

alter table public.sources
  add column if not exists focus text default 'general',
  add column if not exists language text default 'en';

-- Constrain to known values. Future categories require migration to expand.
alter table public.sources
  drop constraint if exists sources_focus_check;
alter table public.sources
  add constraint sources_focus_check
    check (focus in (
      'general', 'business', 'tech', 'magazine',
      'regional', 'sports', 'entertainment'
    ));

alter table public.sources
  drop constraint if exists sources_language_check;
alter table public.sources
  add constraint sources_language_check
    check (language in ('en', 'hi', 'bilingual'));

-- Tag the 10 current publishers we have wired up.
update public.sources set focus = 'general',  language = 'en' where name = 'Times of India';
update public.sources set focus = 'general',  language = 'en' where name = 'Hindustan Times';
update public.sources set focus = 'general',  language = 'en' where name = 'Indian Express';
update public.sources set focus = 'business', language = 'en' where name = 'Mint';
update public.sources set focus = 'general',  language = 'en' where name = 'News18';
update public.sources set focus = 'regional', language = 'en' where name = 'Deccan Chronicle';
update public.sources set focus = 'general',  language = 'en' where name = 'India Today';
update public.sources set focus = 'business', language = 'en' where name = 'Economic Times';
update public.sources set focus = 'magazine', language = 'en' where name = 'The Wire';
update public.sources set focus = 'general',  language = 'hi' where name = 'Aaj Tak';

create index if not exists idx_sources_focus on public.sources(focus);
create index if not exists idx_sources_language on public.sources(language);
