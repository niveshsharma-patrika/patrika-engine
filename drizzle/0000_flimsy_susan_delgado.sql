-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"desk" text,
	"section" text,
	"velocity_pct" numeric,
	"velocity_window" text,
	"trust_score" integer DEFAULT 0,
	"sentiment" text,
	"geography" text,
	"suggested_angle" text,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now(),
	"last_updated" timestamp with time zone DEFAULT now(),
	"title_hi" text,
	"desk_hi" text,
	"suggested_angle_hi" text,
	"primary_lang" text DEFAULT 'en',
	"story_type" text,
	"story_type_hi" text,
	"is_national_or_world" boolean DEFAULT false NOT NULL,
	"last_polished_at" timestamp with time zone,
	"publisher_count" integer DEFAULT 0 NOT NULL,
	"broke_at" timestamp with time zone,
	"angles" jsonb,
	"angles_at" timestamp with time zone,
	"categorized_at" timestamp with time zone,
	CONSTRAINT "trends_trust_score_check" CHECK ((trust_score >= 0) AND (trust_score <= 5)),
	CONSTRAINT "trends_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'dismissed'::text]))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"url" text,
	"handle" text,
	"desk" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync" timestamp with time zone,
	"signals_24h" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"focus" text DEFAULT 'general',
	"language" text DEFAULT 'en',
	CONSTRAINT "sources_url_key" UNIQUE("url"),
	CONSTRAINT "sources_focus_check" CHECK (focus = ANY (ARRAY['general'::text, 'business'::text, 'tech'::text, 'magazine'::text, 'regional'::text, 'sports'::text, 'entertainment'::text])),
	CONSTRAINT "sources_language_check" CHECK (language = ANY (ARRAY['en'::text, 'hi'::text, 'bilingual'::text])),
	CONSTRAINT "sources_source_type_check" CHECK (source_type = ANY (ARRAY['rss'::text, 'twitter'::text, 'google_news'::text, 'sitemap_news'::text, 'reddit'::text, 'youtube'::text]))
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"display_name" text NOT NULL,
	"api_key_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ai_providers_provider_key_key" UNIQUE("provider_key")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_key" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer,
	"input_price_per_million" numeric,
	"output_price_per_million" numeric,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ai_models_provider_id_model_key_key" UNIQUE("provider_id","model_key")
);
--> statement-breakpoint
CREATE TABLE "ai_config" (
	"use_case" text PRIMARY KEY NOT NULL,
	"model_id" uuid NOT NULL,
	"fallback_model_id" uuid,
	"system_prompt" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_type" text NOT NULL,
	"handles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"hits_30d" integer DEFAULT 0 NOT NULL,
	"last_hit" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "watchlist_entity_type_check" CHECK (entity_type = ANY (ARRAY['person'::text, 'organization'::text, 'brand'::text]))
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"author_id" uuid,
	"reviewer_id" uuid,
	"ai_model_id" uuid,
	"word_count" integer DEFAULT 0,
	"style_match" integer,
	"desk" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"image_url" text,
	"image_prompt" text,
	"generation_metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "drafts_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'awaiting_review'::text, 'awaiting_approval'::text, 'approved'::text, 'published'::text, 'rejected'::text]))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'reporter' NOT NULL,
	"desk" text,
	"telegram_handle" text,
	"telegram_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'desk_head'::text, 'sub_editor'::text, 'reporter'::text]))
);
--> statement-breakpoint
CREATE TABLE "style_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"file_url" text,
	"file_size_bytes" bigint,
	"pages" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid,
	"use_case" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"cost_usd" numeric DEFAULT '0',
	"user_id" uuid,
	"draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"display_name" text NOT NULL,
	"key_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_service_key" UNIQUE("service")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text DEFAULT 'cron',
	"sources_fetched" integer DEFAULT 0,
	"sources_failed" integer DEFAULT 0,
	"signals_inserted" integer DEFAULT 0,
	"clusters_found" integer DEFAULT 0,
	"clusters_refined" integer DEFAULT 0,
	"trends_created" integer DEFAULT 0,
	"trends_updated" integer DEFAULT 0,
	"trends_archived" integer DEFAULT 0,
	"duration_ms" integer,
	"error_message" text,
	CONSTRAINT "ingest_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])),
	CONSTRAINT "ingest_runs_trigger_check" CHECK (trigger = ANY (ARRAY['cron'::text, 'manual'::text, 'unknown'::text]))
);
--> statement-breakpoint
CREATE TABLE "style_guidelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "source_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"sitemap_url" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"inferred_focus" text,
	"inferred_language" text,
	"today_article_count" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_candidates_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'adopted'::text, 'dismissed'::text, 'hidden'::text]))
);
--> statement-breakpoint
CREATE TABLE "source_denylist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_denylist_domain_key" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "trend_searches" (
	"trend_id" uuid PRIMARY KEY NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"external_id" text NOT NULL,
	"author" text,
	"content" text NOT NULL,
	"url" text,
	"published_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"topic_id" uuid,
	"watchlist_id" uuid,
	"description" text,
	"keywords" text[],
	"publisher_section" text,
	"enriched_at" timestamp with time zone,
	"enrich_failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "signals_source_external_unique" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"story_type" text,
	"source_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"publication" text DEFAULT 'Patrika' NOT NULL,
	"writer" text
);
--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_config" ADD CONSTRAINT "ai_config_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_config" ADD CONSTRAINT "ai_config_fallback_model_id_fkey" FOREIGN KEY ("fallback_model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_trend_id_fkey" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_guides" ADD CONSTRAINT "style_guides_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_searches" ADD CONSTRAINT "trend_searches_trend_id_fkey" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."trends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trends_broke_at" ON "trends" USING btree ("broke_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_trends_first_seen" ON "trends" USING btree ("first_seen" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_trends_publisher_count" ON "trends" USING btree ("publisher_count" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trends_status" ON "trends" USING btree ("status" timestamptz_ops,"last_updated" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_trends_velocity" ON "trends" USING btree ("velocity_pct" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_sources_focus" ON "sources" USING btree ("focus" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sources_language" ON "sources" USING btree ("language" text_ops);--> statement-breakpoint
CREATE INDEX "idx_drafts_status" ON "drafts" USING btree ("status" text_ops,"updated_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created" ON "ai_usage" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_runs_started" ON "ingest_runs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_source_candidates_status_evidence" ON "source_candidates" USING btree ("status" int4_ops,"evidence_count" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_source_candidates_pending_domain" ON "source_candidates" USING btree ("domain" text_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_source_denylist_expires" ON "source_denylist" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_signals_keywords" ON "signals" USING gin ("keywords" array_ops);--> statement-breakpoint
CREATE INDEX "idx_signals_pending_enrich" ON "signals" USING btree ("id" uuid_ops) WHERE ((enriched_at IS NULL) AND (enrich_failed = false) AND (url IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_signals_published" ON "signals" USING btree ("published_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_signals_topic" ON "signals" USING btree ("topic_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_style_samples_created" ON "style_samples" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_style_samples_publication" ON "style_samples" USING btree ("publication" text_ops);--> statement-breakpoint
CREATE INDEX "idx_style_samples_story_type" ON "style_samples" USING btree ("story_type" text_ops);
*/