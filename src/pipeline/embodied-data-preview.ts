import type { Kysely } from "kysely";
import { parseJson } from "../db/repository.js";
import type { DatabaseSchema } from "../db/types.js";
import type { ContentScope, EmbodiedPipelineStage } from "../domain/embodied-data.js";
import {
  assessEmbodiedDataRelevance,
  type EmbodiedDataRelevanceAssessment,
} from "../domain/embodied-data-relevance.js";

export interface EmbodiedDataPreview {
  schemaVersion: 1;
  generatedAt: string;
  mode: "read-only-preview";
  counts: {
    total: number;
    include: number;
    review: number;
    reject: number;
    profiled: number;
  };
  items: Array<{
    eventId: string;
    slug: string;
    title: string;
    status: string;
    currentScope: ContentScope;
    recommendedDecision: EmbodiedDataRelevanceAssessment["decision"];
    matchedStages: EmbodiedPipelineStage[];
    reasons: string[];
    hasProfile: boolean;
  }>;
}

export async function buildEmbodiedDataPreview(
  db: Kysely<DatabaseSchema>,
  generatedAt = new Date().toISOString(),
): Promise<EmbodiedDataPreview> {
  const [events, profileRows] = await Promise.all([
    db.selectFrom("events").selectAll().execute(),
    db.selectFrom("event_data_profiles").select("event_id").execute(),
  ]);
  const profiledEventIds = new Set(profileRows.map((row) => row.event_id));
  const items = events
    .map((event) => {
      const assessment = assessEmbodiedDataRelevance({
        title: event.title,
        summary: event.summary,
        technicalInsight: event.technical_insight,
        industryInsight: event.industry_insight,
        businessValue: event.business_value,
        category: event.category,
        keywords: parseJson<string[]>(event.keywords_json, []),
      });
      return {
        eventId: event.id,
        slug: event.slug,
        title: event.title,
        status: event.status,
        currentScope: event.content_scope,
        recommendedDecision: assessment.decision,
        matchedStages: assessment.matchedStages,
        reasons: assessment.reasons,
        hasProfile: profiledEventIds.has(event.id),
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    schemaVersion: 1,
    generatedAt,
    mode: "read-only-preview",
    counts: {
      total: items.length,
      include: items.filter((item) => item.recommendedDecision === "include").length,
      review: items.filter((item) => item.recommendedDecision === "review").length,
      reject: items.filter((item) => item.recommendedDecision === "reject").length,
      profiled: items.filter((item) => item.hasProfile).length,
    },
    items,
  };
}
