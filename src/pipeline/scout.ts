import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { Repository, scoutFingerprint } from "../db/repository.js";
import type { DatabaseSchema, EventRow } from "../db/types.js";
import type { EmbodiedPipelineStage } from "../domain/embodied-data.js";
import {
  buildEmbodiedScoutCard,
  type EmbodiedScoutKind,
  embodiedScoutKinds,
} from "../domain/embodied-scout.js";
import { evaluateEventReadiness } from "./readiness.js";

const SCOUT_LIFETIME_MS = 14 * 86_400_000;
export const PUBLIC_SCOUT_POOL_TARGET = 18;
const kinds = embodiedScoutKinds;

export { embodiedScoutKinds };

export async function runScout(db: Kysely<DatabaseSchema>, limit = 3) {
  const repository = new Repository(db);
  const timestamp = new Date().toISOString();
  const expiredResult = await db
    .updateTable("scout_insights")
    .set({ status: "archived", published_at: null, updated_at: timestamp })
    .where("status", "=", "published")
    .where("expires_at", "is not", null)
    .where("expires_at", "<", timestamp)
    .executeTakeFirst();
  const publishedCandidates = await repository.listScoutInsights("published");
  const retainedFingerprints = new Set<string>();
  const duplicateIds: string[] = [];
  for (const insight of publishedCandidates) {
    const fingerprint = scoutFingerprint(insight.kind, insight.title);
    if (retainedFingerprints.has(fingerprint)) duplicateIds.push(insight.id);
    else retainedFingerprints.add(fingerprint);
  }
  if (duplicateIds.length > 0) {
    await db
      .updateTable("scout_insights")
      .set({ status: "archived", published_at: null, updated_at: timestamp })
      .where("id", "in", duplicateIds)
      .execute();
  }
  const publishedPool = publishedCandidates.filter((insight) => !duplicateIds.includes(insight.id));
  const publicFingerprints = new Set(
    publishedPool.map((insight) => scoutFingerprint(insight.kind, insight.title)),
  );
  const publishedKindCounts = new Map(
    kinds.map((kind) => [kind, publishedPool.filter((insight) => insight.kind === kind).length]),
  );
  const requested = Math.max(1, Math.min(limit, PUBLIC_SCOUT_POOL_TARGET));
  const missingKindCount = kinds.filter(
    (kind) => (publishedKindCounts.get(kind) ?? 0) === 0,
  ).length;
  const target = Math.min(
    requested,
    Math.max(PUBLIC_SCOUT_POOL_TARGET - publicFingerprints.size, missingKindCount, 0),
  );
  const publishedEvents = await repository.listEventsByContentScope("embodied-data", "published");
  const events: EventRow[] = [];
  for (const event of publishedEvents) {
    if ((await evaluateEventReadiness(db, event.id)).status === "ready") events.push(event);
  }
  events.sort(
    (a, b) =>
      scoutCandidateScore(b) - scoutCandidateScore(a) ||
      Date.parse(b.updated_at) - Date.parse(a.updated_at),
  );
  const existingCount = (await repository.listScoutInsights()).length;
  let created = 0;
  let published = 0;
  let archived = 0;
  let skipped = 0;

  for (const [index, event] of events.entries()) {
    if (created >= target) break;
    const kind =
      [...kinds].sort(
        (left, right) =>
          (publishedKindCounts.get(left) ?? 0) - (publishedKindCounts.get(right) ?? 0) ||
          ((kinds.indexOf(left) + existingCount + index) % kinds.length) -
            ((kinds.indexOf(right) + existingCount + index) % kinds.length),
      )[0] ?? "collection-route";
    const profile = await repository.getEventDataProfile(event.id);
    const profileKind = kindForStages(profile?.pipelineStages ?? [], kind);
    const selectedKind = (publishedKindCounts.get(profileKind) ?? 0) === 0 ? profileKind : kind;
    const cooldownKey = `${selectedKind}:${event.slug}`;
    const card = buildScoutCard(event, selectedKind);
    const fingerprint = scoutFingerprint(selectedKind, card.title);
    if (publicFingerprints.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    const since = new Date(Date.now() - SCOUT_LIFETIME_MS).toISOString();
    if (await repository.findRecentScoutInsight(cooldownKey, since)) {
      skipped += 1;
      continue;
    }
    const publishable = scoutPublicationDecision({
      ...card,
      eventStatus: event.status,
      contentScope: event.content_scope,
      readinessStatus: "ready",
      genericOpportunity: false,
      duplicateCooldown: false,
    });
    const generatedAt = new Date().toISOString();
    await repository.insertScoutInsight(
      {
        slug: `${selectedKind}-${event.slug}-${shortHash(generatedAt)}`,
        kind: selectedKind,
        status: publishable.allowed ? "published" : "archived",
        ...card,
        cooldown_key: cooldownKey,
        generated_at: generatedAt,
        expires_at: new Date(Date.now() + SCOUT_LIFETIME_MS).toISOString(),
      },
      event.id,
    );
    created += 1;
    if (publishable.allowed) {
      published += 1;
      publicFingerprints.add(fingerprint);
      publishedKindCounts.set(selectedKind, (publishedKindCounts.get(selectedKind) ?? 0) + 1);
    } else archived += 1;
  }
  return {
    scanned: Math.min(events.length, created + skipped),
    candidates: events.length,
    created,
    published,
    archived: archived + duplicateIds.length,
    deduplicated: duplicateIds.length,
    expired: Number(expiredResult.numUpdatedRows ?? 0),
    skipped,
    publishedPoolBefore: new Set(
      publishedPool.map((insight) => scoutFingerprint(insight.kind, insight.title)),
    ).size,
    publishedPoolTarget: PUBLIC_SCOUT_POOL_TARGET,
    mode: "deterministic-v3-autonomous-publishing",
  };
}

export interface ScoutPublicationInput {
  total_score: number;
  evidence_score: number;
  confidence_score: number;
  novelty_score: number;
  eventStatus?: string;
  contentScope?: string;
  readinessStatus?: string;
  evidenceExpiresAt?: string | null;
  genericOpportunity?: boolean;
  duplicateCooldown?: boolean;
}

export function scoutPublicationDecision(input: ScoutPublicationInput): {
  allowed: boolean;
  blockers: string[];
} {
  const blockers = [
    ...(input.total_score < 72 ? ["total_score_below_72"] : []),
    ...(input.evidence_score < 70 ? ["evidence_score_below_70"] : []),
    ...(input.confidence_score < 70 ? ["confidence_score_below_70"] : []),
    ...(input.novelty_score < 55 ? ["novelty_score_below_55"] : []),
    ...(input.eventStatus && input.eventStatus !== "published"
      ? ["trigger_event_not_published"]
      : []),
    ...(input.contentScope && input.contentScope !== "embodied-data"
      ? ["legacy_trigger_event"]
      : []),
    ...(input.readinessStatus && input.readinessStatus !== "ready"
      ? ["trigger_event_not_ready"]
      : []),
    ...(input.evidenceExpiresAt && Date.parse(input.evidenceExpiresAt) <= Date.now()
      ? ["evidence_expired"]
      : []),
    ...(input.genericOpportunity ? ["generic_opportunity"] : []),
    ...(input.duplicateCooldown ? ["duplicate_cooldown"] : []),
  ];
  return { allowed: blockers.length === 0, blockers };
}

export function buildScoutCard(event: EventRow, kind: (typeof kinds)[number]) {
  return buildEmbodiedScoutCard(event, kind);
}

function kindForStages(
  stages: EmbodiedPipelineStage[],
  fallback: EmbodiedScoutKind,
): EmbodiedScoutKind {
  const stageKinds: Partial<Record<EmbodiedPipelineStage, EmbodiedScoutKind>> = {
    "demand-definition": "peer-opportunity",
    "acquisition-route": "collection-route",
    "multimodal-capture": "capture-system",
    "production-operations": "production-operations",
    "data-engineering-standards": "data-standard",
    "quality-training-feedback": "quality-feedback",
  };
  return stages.map((stage) => stageKinds[stage]).find(Boolean) ?? fallback;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function scoutCandidateScore(event: EventRow): number {
  const ageDays = Math.max(0, (Date.now() - Date.parse(event.happened_at)) / 86_400_000);
  const recency = Math.max(0, 30 * (1 - ageDays / 90));
  return event.value_score + event.impact_score + recency;
}
