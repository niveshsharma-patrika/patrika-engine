import { pgTable, index, check, uuid, text, numeric, integer, timestamp, boolean, jsonb, unique, foreignKey, bigint, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const trends = pgTable("trends", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	desk: text(),
	section: text(),
	velocityPct: numeric("velocity_pct"),
	velocityWindow: text("velocity_window"),
	trustScore: integer("trust_score").default(0),
	sentiment: text(),
	geography: text(),
	suggestedAngle: text("suggested_angle"),
	signalCount: integer("signal_count").default(0).notNull(),
	status: text().default('active').notNull(),
	firstSeen: timestamp("first_seen", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastUpdated: timestamp("last_updated", { withTimezone: true, mode: 'string' }).defaultNow(),
	titleHi: text("title_hi"),
	deskHi: text("desk_hi"),
	suggestedAngleHi: text("suggested_angle_hi"),
	primaryLang: text("primary_lang").default('en'),
	storyType: text("story_type"),
	storyTypeHi: text("story_type_hi"),
	isNationalOrWorld: boolean("is_national_or_world").default(false).notNull(),
	lastPolishedAt: timestamp("last_polished_at", { withTimezone: true, mode: 'string' }),
	publisherCount: integer("publisher_count").default(0).notNull(),
	brokeAt: timestamp("broke_at", { withTimezone: true, mode: 'string' }),
	angles: jsonb(),
	anglesAt: timestamp("angles_at", { withTimezone: true, mode: 'string' }),
	categorizedAt: timestamp("categorized_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_trends_broke_at").using("btree", table.brokeAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_trends_first_seen").using("btree", table.firstSeen.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_trends_publisher_count").using("btree", table.publisherCount.desc().nullsFirst().op("int4_ops")),
	index("idx_trends_status").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.lastUpdated.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_trends_velocity").using("btree", table.velocityPct.desc().nullsFirst().op("numeric_ops")),
	check("trends_trust_score_check", sql`(trust_score >= 0) AND (trust_score <= 5)`),
	check("trends_status_check", sql`status = ANY (ARRAY['active'::text, 'archived'::text, 'dismissed'::text])`),
]);

export const sources = pgTable("sources", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	sourceType: text("source_type").notNull(),
	url: text(),
	handle: text(),
	desk: text(),
	isActive: boolean("is_active").default(true).notNull(),
	lastSync: timestamp("last_sync", { withTimezone: true, mode: 'string' }),
	signals24H: integer("signals_24h").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	focus: text().default('general'),
	language: text().default('en'),
}, (table) => [
	index("idx_sources_focus").using("btree", table.focus.asc().nullsLast().op("text_ops")),
	index("idx_sources_language").using("btree", table.language.asc().nullsLast().op("text_ops")),
	unique("sources_url_key").on(table.url),
	check("sources_focus_check", sql`focus = ANY (ARRAY['general'::text, 'business'::text, 'tech'::text, 'magazine'::text, 'regional'::text, 'sports'::text, 'entertainment'::text])`),
	check("sources_language_check", sql`language = ANY (ARRAY['en'::text, 'hi'::text, 'bilingual'::text])`),
	check("sources_source_type_check", sql`source_type = ANY (ARRAY['rss'::text, 'twitter'::text, 'google_news'::text, 'sitemap_news'::text, 'reddit'::text, 'youtube'::text])`),
]);

export const aiProviders = pgTable("ai_providers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	providerKey: text("provider_key").notNull(),
	displayName: text("display_name").notNull(),
	apiKeyEncrypted: text("api_key_encrypted"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("ai_providers_provider_key_key").on(table.providerKey),
]);

export const aiModels = pgTable("ai_models", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	providerId: uuid("provider_id").notNull(),
	modelKey: text("model_key").notNull(),
	displayName: text("display_name").notNull(),
	contextWindow: integer("context_window"),
	inputPricePerMillion: numeric("input_price_per_million"),
	outputPricePerMillion: numeric("output_price_per_million"),
	capabilities: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [aiProviders.id],
			name: "ai_models_provider_id_fkey"
		}).onDelete("cascade"),
	unique("ai_models_provider_id_model_key_key").on(table.providerId, table.modelKey),
]);

export const aiConfig = pgTable("ai_config", {
	useCase: text("use_case").primaryKey().notNull(),
	modelId: uuid("model_id").notNull(),
	fallbackModelId: uuid("fallback_model_id"),
	systemPrompt: text("system_prompt"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [aiModels.id],
			name: "ai_config_model_id_fkey"
		}),
	foreignKey({
			columns: [table.fallbackModelId],
			foreignColumns: [aiModels.id],
			name: "ai_config_fallback_model_id_fkey"
		}),
]);

export const drafts = pgTable("drafts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	trendId: uuid("trend_id"),
	title: text().notNull(),
	body: text(),
	status: text().default('in_progress').notNull(),
	authorId: uuid("author_id"),
	reviewerId: uuid("reviewer_id"),
	aiModelId: uuid("ai_model_id"),
	wordCount: integer("word_count").default(0),
	styleMatch: integer("style_match"),
	desk: text(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	imageUrl: text("image_url"),
	imagePrompt: text("image_prompt"),
	generationMetadata: jsonb("generation_metadata").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_drafts_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.updatedAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.trendId],
			foreignColumns: [trends.id],
			name: "drafts_trend_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [profiles.id],
			name: "drafts_author_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.reviewerId],
			foreignColumns: [profiles.id],
			name: "drafts_reviewer_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.aiModelId],
			foreignColumns: [aiModels.id],
			name: "drafts_ai_model_id_fkey"
		}).onDelete("set null"),
	check("drafts_status_check", sql`status = ANY (ARRAY['in_progress'::text, 'awaiting_review'::text, 'awaiting_approval'::text, 'approved'::text, 'published'::text, 'rejected'::text])`),
]);

// profiles is the user/auth table (repurposed off Supabase Auth):
//   email + passwordHash power native login; role drives admin/user-management.
export const profiles = pgTable("profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text(),
	passwordHash: text("password_hash"),
	isActive: boolean("is_active").default(true).notNull(),
	fullName: text("full_name").notNull(),
	role: text().default('reporter').notNull(),
	edition: text().default('digital').notNull(),
	desk: text(),
	telegramHandle: text("telegram_handle"),
	telegramChatId: text("telegram_chat_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("profiles_email_key").on(table.email),
	check("profiles_role_check", sql`role = ANY (ARRAY['admin'::text, 'desk_head'::text, 'sub_editor'::text, 'reporter'::text])`),
	check("profiles_edition_check", sql`edition = ANY (ARRAY['print'::text, 'digital'::text])`),
]);

export const styleGuides = pgTable("style_guides", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	fileUrl: text("file_url"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
	pages: integer(),
	uploadedBy: uuid("uploaded_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [profiles.id],
			name: "style_guides_uploaded_by_fkey"
		}).onDelete("set null"),
]);

export const aiUsage = pgTable("ai_usage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	modelId: uuid("model_id"),
	useCase: text("use_case"),
	inputTokens: integer("input_tokens").default(0),
	outputTokens: integer("output_tokens").default(0),
	costUsd: numeric("cost_usd").default('0'),
	userId: uuid("user_id"),
	draftId: uuid("draft_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ai_usage_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [aiModels.id],
			name: "ai_usage_model_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "ai_usage_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.draftId],
			foreignColumns: [drafts.id],
			name: "ai_usage_draft_id_fkey"
		}).onDelete("set null"),
]);

export const apiKeys = pgTable("api_keys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	service: text().notNull(),
	displayName: text("display_name").notNull(),
	keyEncrypted: text("key_encrypted").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("api_keys_service_key").on(table.service),
]);

export const ingestRuns = pgTable("ingest_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	status: text().default('running').notNull(),
	trigger: text().default('cron'),
	sourcesFetched: integer("sources_fetched").default(0),
	sourcesFailed: integer("sources_failed").default(0),
	signalsInserted: integer("signals_inserted").default(0),
	clustersFound: integer("clusters_found").default(0),
	clustersRefined: integer("clusters_refined").default(0),
	trendsCreated: integer("trends_created").default(0),
	trendsUpdated: integer("trends_updated").default(0),
	trendsArchived: integer("trends_archived").default(0),
	durationMs: integer("duration_ms"),
	errorMessage: text("error_message"),
}, (table) => [
	index("idx_ingest_runs_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	check("ingest_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])`),
	check("ingest_runs_trigger_check", sql`trigger = ANY (ARRAY['cron'::text, 'manual'::text, 'unknown'::text])`),
]);

export const styleGuidelines = pgTable("style_guidelines", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	content: text().notNull(),
	notes: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const sourceCandidates = pgTable("source_candidates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	domain: text().notNull(),
	sitemapUrl: text("sitemap_url").notNull(),
	evidence: jsonb().default([]).notNull(),
	evidenceCount: integer("evidence_count").default(1).notNull(),
	inferredFocus: text("inferred_focus"),
	inferredLanguage: text("inferred_language"),
	todayArticleCount: integer("today_article_count").default(0),
	status: text().default('pending').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_source_candidates_status_evidence").using("btree", table.status.asc().nullsLast().op("int4_ops"), table.evidenceCount.desc().nullsFirst().op("int4_ops")),
	uniqueIndex("ux_source_candidates_pending_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	check("source_candidates_status_check", sql`status = ANY (ARRAY['pending'::text, 'adopted'::text, 'dismissed'::text, 'hidden'::text])`),
]);

export const sourceDenylist = pgTable("source_denylist", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	domain: text().notNull(),
	reason: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_source_denylist_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	unique("source_denylist_domain_key").on(table.domain),
]);

export const trendSearches = pgTable("trend_searches", {
	trendId: uuid("trend_id").primaryKey().notNull(),
	searchedAt: timestamp("searched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.trendId],
			foreignColumns: [trends.id],
			name: "trend_searches_trend_id_fkey"
		}).onDelete("cascade"),
]);

export const signals = pgTable("signals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceId: uuid("source_id"),
	externalId: text("external_id").notNull(),
	author: text(),
	content: text().notNull(),
	url: text(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).notNull(),
	ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
	topicId: uuid("topic_id"),
	description: text(),
	keywords: text().array(),
	publisherSection: text("publisher_section"),
	enrichedAt: timestamp("enriched_at", { withTimezone: true, mode: 'string' }),
	enrichFailed: boolean("enrich_failed").default(false).notNull(),
}, (table) => [
	index("idx_signals_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_signals_pending_enrich").using("btree", table.id.asc().nullsLast().op("uuid_ops")).where(sql`((enriched_at IS NULL) AND (enrich_failed = false) AND (url IS NOT NULL))`),
	index("idx_signals_published").using("btree", table.publishedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_signals_topic").using("btree", table.topicId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sources.id],
			name: "signals_source_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [trends.id],
			name: "signals_topic_id_fkey"
		}).onDelete("set null"),
	unique("signals_source_external_unique").on(table.sourceId, table.externalId),
]);

export const pipelineSettings = pgTable("pipeline_settings", {
	key: text().primaryKey().notNull(),
	enabled: boolean().notNull(),
	label: text().notNull(),
	description: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const styleSamples = pgTable("style_samples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	body: text().notNull(),
	storyType: text("story_type"),
	sourceUrl: text("source_url"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	publication: text().default('Patrika').notNull(),
	writer: text(),
}, (table) => [
	index("idx_style_samples_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_style_samples_publication").using("btree", table.publication.asc().nullsLast().op("text_ops")),
	index("idx_style_samples_story_type").using("btree", table.storyType.asc().nullsLast().op("text_ops")),
]);

// Per-(control, optionValue) OVERRIDES for the generation control prompts,
// edited from the /directives page. Built-in wording lives in lib/ai/directives.ts;
// only customised rows are stored here. See getEffectiveDirectives().
export const writingDirectives = pgTable("writing_directives", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	control: text().notNull(),
	optionValue: text("option_value").notNull(),
	directive: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("writing_directives_control_option_key").on(table.control, table.optionValue),
]);
