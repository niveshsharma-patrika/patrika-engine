-- ═══════════════════════════════════════════════════════════════
-- Per-publication style samples.
--
-- Each style sample now belongs to a PUBLICATION (Patrika, New York Times,
-- Reuters, Al Jazeera, BBC, Bloomberg) and optionally a WRITER whose voice it
-- exemplifies. The drafting prompt loads the samples for the publication the
-- editor picked, so a draft can be written in that outlet's house style.
--
-- Existing rows default to 'Patrika' (they were all Patrika exemplars).
-- ═══════════════════════════════════════════════════════════════

alter table public.style_samples
  add column if not exists publication text not null default 'Patrika',
  add column if not exists writer text;

create index if not exists idx_style_samples_publication
  on public.style_samples(publication);
