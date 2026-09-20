import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedPeers } from "../src/catalog/embodied-data/peers.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";

const pipelineTrackSlugs = [
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
] as const;

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

describe("embodied data public boundary", () => {
  it("keeps every default public read inside the embodied current domain", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    const repository = new Repository(db);

    const legacyEvent = await db
      .selectFrom("events")
      .select("id")
      .where("content_scope", "=", "legacy-ai")
      .executeTakeFirstOrThrow();
    const timestamp = "2026-09-20T00:00:00.000Z";
    const legacyScoutId = randomUUID();
    await db
      .insertInto("scout_insights")
      .values({
        id: legacyScoutId,
        slug: "legacy-ai-scout-fixture",
        kind: "learning",
        status: "published",
        title: "Legacy AI scout fixture",
        observation: "Legacy AI observation kept for audit only.",
        hypothesis: "Legacy AI hypothesis kept for audit only.",
        why_now: "Historical fixture.",
        target_audience: "Historical users",
        suggested_action: "Do not publish this fixture.",
        artifact_idea: "Historical note",
        counter_signals: "Not applicable.",
        horizon: "archived",
        confidence_score: 70,
        evidence_score: 70,
        novelty_score: 70,
        leverage_score: 70,
        total_score: 70,
        cooldown_key: "legacy-ai-scout-fixture",
        generated_at: timestamp,
        expires_at: null,
        published_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("scout_evidence")
      .values({
        insight_id: legacyScoutId,
        event_id: legacyEvent.id,
        evidence_role: "trigger",
        weight: 100,
        created_at: timestamp,
      })
      .execute();

    expect((await repository.publicEvents()).map((item) => item.slug).sort()).toEqual(
      embodiedLaunchEvents.map((item) => item.slug).sort(),
    );
    expect((await repository.publicSignals()).every((item) => item.sourceSlug.length > 0)).toBe(
      true,
    );
    expect((await repository.listTracks()).map((item) => item.slug)).toEqual(pipelineTrackSlugs);
    expect((await repository.listActors()).map((item) => item.slug).sort()).toEqual(
      embodiedPeers.map((item) => item.actorSlug).sort(),
    );
    expect(await repository.listResources()).toEqual([]);
    expect((await repository.publicScoutInsights()).map((item) => item.slug)).toEqual([
      "scout-embodied-data-production-audit",
    ]);
    expect(await repository.getDefaultView()).toMatchObject({
      slug: "embodied-data-operations",
      is_default: 1,
      status: "published",
    });

    const auditedEvents = await repository.auditEvents({ scope: "all" });
    expect(auditedEvents.some((item) => item.content_scope === "legacy-ai")).toBe(true);
    expect(auditedEvents.some((item) => item.content_scope === "embodied-data")).toBe(true);
    expect((await repository.auditSignals({ scope: "all" })).length).toBeGreaterThan(
      (await repository.publicSignals()).length,
    );
    expect((await repository.auditActors({ scope: "all" })).length).toBeGreaterThan(
      embodiedPeers.length,
    );
    expect((await repository.auditTracks()).length).toBeGreaterThan(pipelineTrackSlugs.length);
    expect((await repository.auditResources()).length).toBeGreaterThan(0);
    expect((await repository.auditViews()).length).toBeGreaterThan(1);
    expect((await repository.auditScoutInsights()).map((item) => item.slug)).toContain(
      "legacy-ai-scout-fixture",
    );
  });
});
