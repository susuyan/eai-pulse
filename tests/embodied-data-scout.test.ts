import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import type { EventRow } from "../src/db/types.js";
import {
  buildScoutCard,
  embodiedScoutKinds,
  scoutPublicationDecision,
} from "../src/pipeline/scout.js";
import { restoreRepositorySnapshot } from "../src/pipeline/snapshot.js";

const event = {
  slug: "robot-data-factory",
  title: "Robot data factory publishes a verified collection workflow",
  fact_summary: "The official project published a verified collection workflow and audit fields.",
  summary: "The workflow connects collection operations with auditable delivery.",
  technical_insight:
    "Versioned task, device, calibration, and quality fields make each run traceable.",
  industry_insight: "Buyers can compare production evidence instead of relying on capacity claims.",
  future_outlook:
    "Watch whether independent teams reproduce the workflow and report delivery outcomes.",
  business_value:
    "Pilot the audit fields on one live collection batch and stop if they do not predict rework.",
  confidence_score: 90,
  heat_score: 85,
  impact_score: 92,
  value_score: 95,
} as EventRow;
const snapshotPath = fileURLToPath(new URL("../data/snapshot/v1.json", import.meta.url));

describe("embodied data Scout", () => {
  it.each(embodiedScoutKinds)("builds a bounded %s opportunity", (kind) => {
    const card = buildScoutCard(event, kind);
    expect(card).toMatchObject({
      target_audience: expect.any(String),
      why_now: expect.any(String),
      hypothesis: expect.any(String),
      artifact_idea: expect.any(String),
      suggested_action: expect.any(String),
      counter_signals: expect.any(String),
    });
    expect(card.counter_signals).toMatch(/证据|失效|风险/);
  });

  it("uses the trigger Event instead of shared boilerplate", () => {
    const cards = embodiedScoutKinds.map((kind) => buildScoutCard(event, kind));
    for (const card of cards) {
      expect(card.observation).toContain(event.fact_summary);
      expect(card.why_now).toContain(event.future_outlook);
      expect(card.suggested_action).toBe(event.business_value);
    }
    expect(
      new Set(
        cards.map((card) =>
          [card.hypothesis, card.target_audience, card.artifact_idea, card.counter_signals].join(
            "|",
          ),
        ),
      ).size,
    ).toBe(embodiedScoutKinds.length);
  });

  it("publishes only current embodied Scout kinds", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      const trigger = await db
        .selectFrom("events")
        .select("id")
        .where("slug", "=", "droid-distributed-collection")
        .executeTakeFirstOrThrow();
      const legacyId = randomUUID();
      await db
        .insertInto("scout_insights")
        .values({
          id: legacyId,
          slug: "legacy-embodied-artifact",
          kind: "artifact",
          status: "published",
          title: "Legacy card",
          observation: "Legacy observation",
          hypothesis: "Legacy hypothesis",
          why_now: "Legacy timing",
          target_audience: "Legacy audience",
          suggested_action: "Legacy action",
          artifact_idea: "Legacy artifact",
          counter_signals: "Legacy invalidation",
          horizon: "7-30d",
          confidence_score: 90,
          evidence_score: 90,
          novelty_score: 90,
          leverage_score: 90,
          total_score: 90,
          cooldown_key: "legacy:artifact",
          generated_at: "2026-09-20T00:00:00.000Z",
          expires_at: null,
          published_at: "2026-09-20T00:00:00.000Z",
          created_at: "2026-09-20T00:00:00.000Z",
          updated_at: "2026-09-20T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("scout_evidence")
        .values({
          insight_id: legacyId,
          event_id: trigger.id,
          evidence_role: "trigger",
          weight: 100,
          created_at: "2026-09-20T00:00:00.000Z",
        })
        .execute();

      const insights = await new Repository(db).publicScoutInsights();
      expect(new Set(insights.map((insight) => insight.kind))).toEqual(new Set(embodiedScoutKinds));
      expect(insights.map((insight) => insight.slug)).not.toContain("legacy-embodied-artifact");

      const collectionInsight = await db
        .selectFrom("scout_insights")
        .select("id")
        .where("slug", "=", "scout-collection-route")
        .executeTakeFirstOrThrow();
      const reviewEvidence = await db
        .selectFrom("events")
        .select(["id", "slug"])
        .where("slug", "=", "rh20t-force-aware-capture")
        .executeTakeFirstOrThrow();
      await db
        .updateTable("events")
        .set({ status: "review" })
        .where("id", "=", reviewEvidence.id)
        .execute();
      await db
        .insertInto("scout_evidence")
        .values({
          insight_id: collectionInsight.id,
          event_id: reviewEvidence.id,
          evidence_role: "corroborating",
          weight: 50,
          created_at: "2026-09-20T00:00:00.000Z",
        })
        .execute();

      const mixedEvidence = await new Repository(db).publicScoutInsights();
      const collectionCard = mixedEvidence.find(
        (insight) => insight.slug === "scout-collection-route",
      );
      expect(collectionCard).toBeDefined();
      expect(collectionCard?.evidence.map((row) => row.slug)).not.toContain(reviewEvidence.slug);

      await db
        .updateTable("events")
        .set({ status: "review" })
        .where("id", "=", trigger.id)
        .execute();
      expect(
        (await new Repository(db).publicScoutInsights()).map((insight) => insight.slug),
      ).not.toContain("scout-collection-route");
    } finally {
      await db.destroy();
    }
  });

  it("archives legacy snapshot Scout rows without a publication timestamp", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-legacy-scout-"));
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      scoutInsights: Array<Record<string, unknown>>;
    };
    const current = snapshot.scoutInsights[0];
    if (!current) throw new Error("Missing Scout snapshot fixture");
    snapshot.scoutInsights.push({
      ...current,
      id: randomUUID(),
      slug: "legacy-snapshot-artifact",
      kind: "artifact",
      publishedAt: "2026-09-20T00:00:00.000Z",
    });
    await writeFile(join(root, "snapshot.json"), `${JSON.stringify(snapshot)}\n`, "utf8");

    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      await restoreRepositorySnapshot(db, root, "snapshot.json");
      const restored = await db
        .selectFrom("scout_insights")
        .select(["status", "published_at"])
        .where("slug", "=", "legacy-snapshot-artifact")
        .executeTakeFirstOrThrow();
      expect(restored).toEqual({ status: "archived", published_at: null });
    } finally {
      await db.destroy();
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);

  it("keeps only distinct embodied action cards in the versioned snapshot", async () => {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      scoutInsights: Array<{
        kind: string;
        hypothesis: string;
        suggestedAction: string;
        counterSignals: string;
      }>;
    };
    expect(snapshot.scoutInsights).toHaveLength(embodiedScoutKinds.length);
    expect(new Set(snapshot.scoutInsights.map((insight) => insight.kind))).toEqual(
      new Set(embodiedScoutKinds),
    );
    expect(
      new Set(
        snapshot.scoutInsights.map((insight) =>
          [insight.hypothesis, insight.suggestedAction, insight.counterSignals].join("|"),
        ),
      ).size,
    ).toBe(embodiedScoutKinds.length);
  });

  it("fails closed for legacy, review-only, unready, expired, generic, and duplicate triggers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T00:00:00.000Z"));
    const card = buildScoutCard(event, "collection-route");
    const base = {
      ...card,
      eventStatus: "published",
      contentScope: "embodied-data",
      readinessStatus: "ready",
    };
    expect(scoutPublicationDecision({ ...base, eventStatus: "review" }).blockers).toContain(
      "trigger_event_not_published",
    );
    expect(scoutPublicationDecision({ ...base, contentScope: "legacy-ai" }).blockers).toContain(
      "legacy_trigger_event",
    );
    expect(scoutPublicationDecision({ ...base, readinessStatus: "blocked" }).blockers).toContain(
      "trigger_event_not_ready",
    );
    expect(
      scoutPublicationDecision({ ...base, evidenceExpiresAt: "2026-09-19T00:00:00.000Z" }).blockers,
    ).toContain("evidence_expired");
    expect(scoutPublicationDecision({ ...base, genericOpportunity: true }).blockers).toContain(
      "generic_opportunity",
    );
    expect(scoutPublicationDecision({ ...base, duplicateCooldown: true }).blockers).toContain(
      "duplicate_cooldown",
    );
    vi.useRealTimers();
  });
});
