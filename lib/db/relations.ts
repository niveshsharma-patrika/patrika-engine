import { relations } from "drizzle-orm/relations";
import { aiProviders, aiModels, aiConfig, trends, drafts, profiles, styleGuides, aiUsage, trendSearches, sources, signals, watchlist } from "./schema";

export const aiModelsRelations = relations(aiModels, ({one, many}) => ({
	aiProvider: one(aiProviders, {
		fields: [aiModels.providerId],
		references: [aiProviders.id]
	}),
	aiConfigs_modelId: many(aiConfig, {
		relationName: "aiConfig_modelId_aiModels_id"
	}),
	aiConfigs_fallbackModelId: many(aiConfig, {
		relationName: "aiConfig_fallbackModelId_aiModels_id"
	}),
	drafts: many(drafts),
	aiUsages: many(aiUsage),
}));

export const aiProvidersRelations = relations(aiProviders, ({many}) => ({
	aiModels: many(aiModels),
}));

export const aiConfigRelations = relations(aiConfig, ({one}) => ({
	aiModel_modelId: one(aiModels, {
		fields: [aiConfig.modelId],
		references: [aiModels.id],
		relationName: "aiConfig_modelId_aiModels_id"
	}),
	aiModel_fallbackModelId: one(aiModels, {
		fields: [aiConfig.fallbackModelId],
		references: [aiModels.id],
		relationName: "aiConfig_fallbackModelId_aiModels_id"
	}),
}));

export const draftsRelations = relations(drafts, ({one, many}) => ({
	trend: one(trends, {
		fields: [drafts.trendId],
		references: [trends.id]
	}),
	profile_authorId: one(profiles, {
		fields: [drafts.authorId],
		references: [profiles.id],
		relationName: "drafts_authorId_profiles_id"
	}),
	profile_reviewerId: one(profiles, {
		fields: [drafts.reviewerId],
		references: [profiles.id],
		relationName: "drafts_reviewerId_profiles_id"
	}),
	aiModel: one(aiModels, {
		fields: [drafts.aiModelId],
		references: [aiModels.id]
	}),
	aiUsages: many(aiUsage),
}));

export const trendsRelations = relations(trends, ({many}) => ({
	drafts: many(drafts),
	trendSearches: many(trendSearches),
	signals: many(signals),
}));

export const profilesRelations = relations(profiles, ({many}) => ({
	drafts_authorId: many(drafts, {
		relationName: "drafts_authorId_profiles_id"
	}),
	drafts_reviewerId: many(drafts, {
		relationName: "drafts_reviewerId_profiles_id"
	}),
	styleGuides: many(styleGuides),
	aiUsages: many(aiUsage),
}));

export const styleGuidesRelations = relations(styleGuides, ({one}) => ({
	profile: one(profiles, {
		fields: [styleGuides.uploadedBy],
		references: [profiles.id]
	}),
}));

export const aiUsageRelations = relations(aiUsage, ({one}) => ({
	aiModel: one(aiModels, {
		fields: [aiUsage.modelId],
		references: [aiModels.id]
	}),
	profile: one(profiles, {
		fields: [aiUsage.userId],
		references: [profiles.id]
	}),
	draft: one(drafts, {
		fields: [aiUsage.draftId],
		references: [drafts.id]
	}),
}));

export const trendSearchesRelations = relations(trendSearches, ({one}) => ({
	trend: one(trends, {
		fields: [trendSearches.trendId],
		references: [trends.id]
	}),
}));

export const signalsRelations = relations(signals, ({one}) => ({
	source: one(sources, {
		fields: [signals.sourceId],
		references: [sources.id]
	}),
	trend: one(trends, {
		fields: [signals.topicId],
		references: [trends.id]
	}),
	watchlist: one(watchlist, {
		fields: [signals.watchlistId],
		references: [watchlist.id]
	}),
}));

export const sourcesRelations = relations(sources, ({many}) => ({
	signals: many(signals),
}));

export const watchlistRelations = relations(watchlist, ({many}) => ({
	signals: many(signals),
}));