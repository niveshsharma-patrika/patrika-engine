--
-- PostgreSQL database dump
--

\restrict WHMO0GxKbveHDqJOFhqvHbcMvHO9FFdgAm3WN0oz6yKiAK2M3x9O3gSSf7wrGfD

-- Dumped from database version 16.14 (Homebrew)
-- Dumped by pg_dump version 16.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_config (
    use_case text NOT NULL,
    model_id uuid NOT NULL,
    fallback_model_id uuid,
    system_prompt text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    model_key text NOT NULL,
    display_name text NOT NULL,
    context_window integer,
    input_price_per_million numeric,
    output_price_per_million numeric,
    capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_key text NOT NULL,
    display_name text NOT NULL,
    api_key_encrypted text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_id uuid,
    use_case text,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    cost_usd numeric DEFAULT 0,
    user_id uuid,
    draft_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service text NOT NULL,
    display_name text NOT NULL,
    key_encrypted text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trend_id uuid,
    title text NOT NULL,
    body text,
    status text DEFAULT 'in_progress'::text NOT NULL,
    author_id uuid,
    reviewer_id uuid,
    ai_model_id uuid,
    word_count integer DEFAULT 0,
    style_match integer,
    desk text,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    image_url text,
    image_prompt text,
    generation_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT drafts_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'awaiting_review'::text, 'awaiting_approval'::text, 'approved'::text, 'published'::text, 'rejected'::text])))
);


--
-- Name: ingest_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    trigger text DEFAULT 'cron'::text,
    sources_fetched integer DEFAULT 0,
    sources_failed integer DEFAULT 0,
    signals_inserted integer DEFAULT 0,
    clusters_found integer DEFAULT 0,
    clusters_refined integer DEFAULT 0,
    trends_created integer DEFAULT 0,
    trends_updated integer DEFAULT 0,
    trends_archived integer DEFAULT 0,
    duration_ms integer,
    error_message text,
    CONSTRAINT ingest_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text]))),
    CONSTRAINT ingest_runs_trigger_check CHECK ((trigger = ANY (ARRAY['cron'::text, 'manual'::text, 'unknown'::text])))
);


--
-- Name: pipeline_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_settings (
    key text NOT NULL,
    enabled boolean NOT NULL,
    label text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'reporter'::text NOT NULL,
    desk text,
    telegram_handle text,
    telegram_chat_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email text,
    password_hash text,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'desk_head'::text, 'sub_editor'::text, 'reporter'::text])))
);


--
-- Name: signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid,
    external_id text NOT NULL,
    author text,
    content text NOT NULL,
    url text,
    published_at timestamp with time zone NOT NULL,
    ingested_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    topic_id uuid,
    watchlist_id uuid,
    description text,
    keywords text[],
    publisher_section text,
    enriched_at timestamp with time zone,
    enrich_failed boolean DEFAULT false NOT NULL
);


--
-- Name: source_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain text NOT NULL,
    sitemap_url text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_count integer DEFAULT 1 NOT NULL,
    inferred_focus text,
    inferred_language text,
    today_article_count integer DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'adopted'::text, 'dismissed'::text, 'hidden'::text])))
);


--
-- Name: source_denylist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_denylist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain text NOT NULL,
    reason text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    source_type text NOT NULL,
    url text,
    handle text,
    desk text,
    is_active boolean DEFAULT true NOT NULL,
    last_sync timestamp with time zone,
    signals_24h integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    focus text DEFAULT 'general'::text,
    language text DEFAULT 'en'::text,
    CONSTRAINT sources_focus_check CHECK ((focus = ANY (ARRAY['general'::text, 'business'::text, 'tech'::text, 'magazine'::text, 'regional'::text, 'sports'::text, 'entertainment'::text]))),
    CONSTRAINT sources_language_check CHECK ((language = ANY (ARRAY['en'::text, 'hi'::text, 'bilingual'::text]))),
    CONSTRAINT sources_source_type_check CHECK ((source_type = ANY (ARRAY['rss'::text, 'twitter'::text, 'google_news'::text, 'sitemap_news'::text, 'reddit'::text, 'youtube'::text])))
);


--
-- Name: style_guidelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.style_guidelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: style_guides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.style_guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    file_url text,
    file_size_bytes bigint,
    pages integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: style_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.style_samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    story_type text,
    source_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    publication text DEFAULT 'Patrika'::text NOT NULL,
    writer text
);


--
-- Name: trend_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trend_searches (
    trend_id uuid NOT NULL,
    searched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    desk text,
    section text,
    velocity_pct numeric,
    velocity_window text,
    trust_score integer DEFAULT 0,
    sentiment text,
    geography text,
    suggested_angle text,
    signal_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    first_seen timestamp with time zone DEFAULT now(),
    last_updated timestamp with time zone DEFAULT now(),
    title_hi text,
    desk_hi text,
    suggested_angle_hi text,
    primary_lang text DEFAULT 'en'::text,
    story_type text,
    story_type_hi text,
    is_national_or_world boolean DEFAULT false NOT NULL,
    last_polished_at timestamp with time zone,
    publisher_count integer DEFAULT 0 NOT NULL,
    broke_at timestamp with time zone,
    angles jsonb,
    angles_at timestamp with time zone,
    categorized_at timestamp with time zone,
    CONSTRAINT trends_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'dismissed'::text]))),
    CONSTRAINT trends_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 5)))
);


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    entity_type text NOT NULL,
    handles jsonb DEFAULT '[]'::jsonb NOT NULL,
    alerts_enabled boolean DEFAULT true NOT NULL,
    hits_30d integer DEFAULT 0 NOT NULL,
    last_hit timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT watchlist_entity_type_check CHECK ((entity_type = ANY (ARRAY['person'::text, 'organization'::text, 'brand'::text])))
);


--
-- Name: ai_config ai_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_pkey PRIMARY KEY (use_case);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_provider_id_model_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_provider_id_model_key_key UNIQUE (provider_id, model_key);


--
-- Name: ai_providers ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_providers
    ADD CONSTRAINT ai_providers_pkey PRIMARY KEY (id);


--
-- Name: ai_providers ai_providers_provider_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_providers
    ADD CONSTRAINT ai_providers_provider_key_key UNIQUE (provider_key);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_service_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_service_key UNIQUE (service);


--
-- Name: drafts drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_pkey PRIMARY KEY (id);


--
-- Name: ingest_runs ingest_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_runs
    ADD CONSTRAINT ingest_runs_pkey PRIMARY KEY (id);


--
-- Name: pipeline_settings pipeline_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_settings
    ADD CONSTRAINT pipeline_settings_pkey PRIMARY KEY (key);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: signals signals_source_external_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_source_external_unique UNIQUE (source_id, external_id);


--
-- Name: source_candidates source_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_candidates
    ADD CONSTRAINT source_candidates_pkey PRIMARY KEY (id);


--
-- Name: source_denylist source_denylist_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_denylist
    ADD CONSTRAINT source_denylist_domain_key UNIQUE (domain);


--
-- Name: source_denylist source_denylist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_denylist
    ADD CONSTRAINT source_denylist_pkey PRIMARY KEY (id);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: sources sources_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_url_key UNIQUE (url);


--
-- Name: style_guidelines style_guidelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_guidelines
    ADD CONSTRAINT style_guidelines_pkey PRIMARY KEY (id);


--
-- Name: style_guides style_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_guides
    ADD CONSTRAINT style_guides_pkey PRIMARY KEY (id);


--
-- Name: style_samples style_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_samples
    ADD CONSTRAINT style_samples_pkey PRIMARY KEY (id);


--
-- Name: trend_searches trend_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_searches
    ADD CONSTRAINT trend_searches_pkey PRIMARY KEY (trend_id);


--
-- Name: trends trends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trends
    ADD CONSTRAINT trends_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_created ON public.ai_usage USING btree (created_at DESC);


--
-- Name: idx_drafts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drafts_status ON public.drafts USING btree (status, updated_at DESC);


--
-- Name: idx_ingest_runs_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_runs_started ON public.ingest_runs USING btree (started_at DESC);


--
-- Name: idx_signals_keywords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_keywords ON public.signals USING gin (keywords);


--
-- Name: idx_signals_pending_enrich; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_pending_enrich ON public.signals USING btree (id) WHERE ((enriched_at IS NULL) AND (enrich_failed = false) AND (url IS NOT NULL));


--
-- Name: idx_signals_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_published ON public.signals USING btree (published_at DESC);


--
-- Name: idx_signals_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_topic ON public.signals USING btree (topic_id);


--
-- Name: idx_source_candidates_status_evidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_candidates_status_evidence ON public.source_candidates USING btree (status, evidence_count DESC);


--
-- Name: idx_source_denylist_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_denylist_expires ON public.source_denylist USING btree (expires_at);


--
-- Name: idx_sources_focus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sources_focus ON public.sources USING btree (focus);


--
-- Name: idx_sources_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sources_language ON public.sources USING btree (language);


--
-- Name: idx_style_samples_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_style_samples_created ON public.style_samples USING btree (created_at DESC);


--
-- Name: idx_style_samples_publication; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_style_samples_publication ON public.style_samples USING btree (publication);


--
-- Name: idx_style_samples_story_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_style_samples_story_type ON public.style_samples USING btree (story_type);


--
-- Name: idx_trends_broke_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trends_broke_at ON public.trends USING btree (broke_at DESC);


--
-- Name: idx_trends_first_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trends_first_seen ON public.trends USING btree (first_seen DESC);


--
-- Name: idx_trends_publisher_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trends_publisher_count ON public.trends USING btree (publisher_count DESC);


--
-- Name: idx_trends_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trends_status ON public.trends USING btree (status, last_updated DESC);


--
-- Name: idx_trends_velocity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trends_velocity ON public.trends USING btree (velocity_pct DESC);


--
-- Name: ux_source_candidates_pending_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_source_candidates_pending_domain ON public.source_candidates USING btree (domain) WHERE (status = 'pending'::text);


--
-- Name: ai_providers trg_ai_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: api_keys trg_api_keys_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: drafts trg_drafts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_config ai_config_fallback_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_fallback_model_id_fkey FOREIGN KEY (fallback_model_id) REFERENCES public.ai_models(id);


--
-- Name: ai_config ai_config_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ai_models(id);


--
-- Name: ai_models ai_models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.ai_providers(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.drafts(id) ON DELETE SET NULL;


--
-- Name: ai_usage ai_usage_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ai_models(id) ON DELETE SET NULL;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: drafts drafts_ai_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id) ON DELETE SET NULL;


--
-- Name: drafts drafts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: drafts drafts_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: drafts drafts_trend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_trend_id_fkey FOREIGN KEY (trend_id) REFERENCES public.trends(id) ON DELETE SET NULL;


--
-- Name: signals signals_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;


--
-- Name: signals signals_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.trends(id) ON DELETE SET NULL;


--
-- Name: signals signals_watchlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES public.watchlist(id) ON DELETE SET NULL;


--
-- Name: style_guides style_guides_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_guides
    ADD CONSTRAINT style_guides_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: trend_searches trend_searches_trend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_searches
    ADD CONSTRAINT trend_searches_trend_id_fkey FOREIGN KEY (trend_id) REFERENCES public.trends(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict WHMO0GxKbveHDqJOFhqvHbcMvHO9FFdgAm3WN0oz6yKiAK2M3x9O3gSSf7wrGfD

