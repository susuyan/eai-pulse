import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { earlyHistoryEvents } from "../src/catalog/early-history.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { historicalEvents } from "../src/catalog/history.js";
import { recentDensityEvents } from "../src/catalog/recent-density.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { findEventMergeCandidates, mergeEventCandidates } from "../src/pipeline/event-merge.js";
import profiles from "./fixtures/embodied-data/data-profiles.json" with { type: "json" };
import actorCapabilities from "./fixtures/embodied-data/objects/actor-capabilities.json" with {
  type: "json",
};
import collectionMethods from "./fixtures/embodied-data/objects/collection-methods.json" with {
  type: "json",
};
import datasets from "./fixtures/embodied-data/objects/datasets.json" with { type: "json" };
import standards from "./fixtures/embodied-data/objects/standards.json" with { type: "json" };

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function setup() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return db;
}

describe("event merge candidate queue", () => {
  it("groups fragmented model events without mutating them", async () => {
    const db = await setup();
    const original = await db
      .selectFrom("events")
      .selectAll()
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    const duplicateId = randomUUID();
    await db
      .insertInto("events")
      .values({
        ...original,
        id: duplicateId,
        slug: "openai-o1-follow-up-fixture",
        title: "OpenAI o1 capability expansion through test-time compute",
        status: "review",
        manual_override: 0,
        published_at: null,
      })
      .execute();

    const groups = await findEventMergeCandidates(db);
    const group = groups.find((item) => item.events.some((event) => event.id === duplicateId));

    expect(group?.events).toHaveLength(2);
    expect(group?.targetEventId).toBe(original.id);
    expect(
      await db
        .selectFrom("events")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      count:
        earlyHistoryEvents.length +
        historicalEvents.length +
        recentDensityEvents.length +
        embodiedLaunchEvents.length +
        7,
    });

    const result = await mergeEventCandidates(db, {
      targetEventId: original.id,
      sourceEventIds: [duplicateId],
      reason: "entity_fingerprint",
      mergedBy: "test",
    });
    expect(result).toEqual({ targetEventId: original.id, merged: 1 });
    expect(
      await db.selectFrom("events").select("id").where("id", "=", duplicateId).executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db
        .selectFrom("event_merges")
        .select(["target_event_id", "source_event_id", "merged_by"])
        .executeTakeFirstOrThrow(),
    ).toEqual({
      target_event_id: original.id,
      source_event_id: duplicateId,
      merged_by: "test",
    });
  });

  it("keeps incidents separate from model releases", async () => {
    const db = await setup();
    const original = await db
      .selectFrom("events")
      .selectAll()
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    const incidentId = randomUUID();
    await db
      .insertInto("events")
      .values({
        ...original,
        id: incidentId,
        slug: "openai-o1-outage-fixture",
        title: "OpenAI o1 outage incident",
        status: "review",
        manual_override: 0,
        published_at: null,
      })
      .execute();

    const groups = await findEventMergeCandidates(db);

    expect(groups.some((item) => item.events.some((event) => event.id === incidentId))).toBe(false);
  });

  it("refuses to merge a published event as a disposable branch", async () => {
    const db = await setup();
    const events = await db
      .selectFrom("events")
      .selectAll()
      .where("status", "=", "published")
      .limit(2)
      .execute();

    await expect(
      mergeEventCandidates(db, {
        targetEventId: events[0]?.id ?? "missing",
        sourceEventIds: [events[1]?.id ?? "missing"],
        reason: "manual-review",
        mergedBy: "test",
      }),
    ).rejects.toThrow("Published source events must be unpublished before merge");
  });

  it("preserves embodied object evidence when merging a source event", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const target = await db
      .selectFrom("events")
      .selectAll()
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    const sourceId = randomUUID();
    await db
      .insertInto("events")
      .values({
        ...target,
        id: sourceId,
        slug: "openai-o1-embodied-links-fixture",
        title: "OpenAI o1 capability expansion through test-time compute",
        status: "review",
        manual_override: 0,
        published_at: null,
      })
      .execute();
    const actor = await db.selectFrom("actors").select("id").executeTakeFirstOrThrow();
    const dataset = datasets[0];
    const standard = standards[0];
    const method = collectionMethods[0];
    const capability = actorCapabilities[0];
    if (!dataset || !standard || !method || !capability) throw new Error("Missing fixture");

    const datasetId = await repository.upsertDataset(dataset.slug, dataset.profile);
    const standardId = await repository.upsertStandard(standard.slug, standard.profile);
    const methodId = await repository.upsertCollectionMethod(method.slug, method.profile);
    const capabilityId = await repository.upsertActorDataCapability(actor.id, capability);
    await repository.linkDatasetEvent(datasetId, sourceId, "release");
    await repository.linkStandardEvent(standardId, sourceId, "publication");
    await repository.linkCollectionMethodEvent(methodId, sourceId, "demonstration");
    await repository.linkActorCapabilityEvidence(capabilityId, sourceId, "verification");
    const profile = profiles.valid[0];
    if (!profile) throw new Error("Missing profile fixture");
    await repository.upsertEventDataProfile(sourceId, profile);
    const scoutInsight = await db
      .selectFrom("scout_insights")
      .select("id")
      .executeTakeFirstOrThrow();
    await db
      .deleteFrom("scout_evidence")
      .where("insight_id", "=", scoutInsight.id)
      .where("event_id", "=", target.id)
      .execute();
    await db
      .insertInto("scout_evidence")
      .values({
        insight_id: scoutInsight.id,
        event_id: sourceId,
        evidence_role: "trigger",
        weight: 80,
        created_at: "2026-09-20T00:00:00.000Z",
      })
      .execute();

    await mergeEventCandidates(db, {
      targetEventId: target.id,
      sourceEventIds: [sourceId],
      reason: "entity_fingerprint",
      mergedBy: "test",
    });

    expect(
      await db.selectFrom("dataset_events").selectAll().where("event_id", "=", target.id).execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom("standard_events")
        .selectAll()
        .where("event_id", "=", target.id)
        .execute(),
    ).toHaveLength(1);
    expect(await repository.getEventDataProfile(target.id)).toEqual(profile);
    expect(
      await db
        .selectFrom("scout_evidence")
        .selectAll()
        .where("insight_id", "=", scoutInsight.id)
        .where("event_id", "=", target.id)
        .execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom("collection_method_events")
        .selectAll()
        .where("event_id", "=", target.id)
        .execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom("actor_capability_evidence")
        .selectAll()
        .where("event_id", "=", target.id)
        .execute(),
    ).toHaveLength(1);
    const audit = await db
      .selectFrom("event_merges")
      .select("source_snapshot_json")
      .where("source_event_id", "=", sourceId)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(audit.source_snapshot_json)).toMatchObject({
      datasetEvents: [expect.objectContaining({ dataset_id: datasetId })],
      standardEvents: [expect.objectContaining({ standard_id: standardId })],
      collectionMethodEvents: [expect.objectContaining({ collection_method_id: methodId })],
      actorCapabilityEvidence: [expect.objectContaining({ capability_id: capabilityId })],
      eventDataProfile: expect.objectContaining({ event_id: sourceId }),
      scoutEvidence: [expect.objectContaining({ insight_id: scoutInsight.id })],
    });
  });

  it("refuses to merge conflicting Event DataProfiles", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const target = await db
      .selectFrom("events")
      .selectAll()
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    const sourceId = randomUUID();
    await db
      .insertInto("events")
      .values({
        ...target,
        id: sourceId,
        slug: "openai-o1-profile-conflict-fixture",
        title: "OpenAI o1 capability expansion through test-time compute",
        status: "review",
        manual_override: 0,
        published_at: null,
      })
      .execute();
    const targetProfile = profiles.valid[0];
    if (!targetProfile) throw new Error("Missing profile fixture");
    const sourceProfile = {
      ...targetProfile,
      deliveryImpact: `${targetProfile.deliveryImpact} Conflicting source interpretation.`,
    };
    await repository.upsertEventDataProfile(target.id, targetProfile);
    await repository.upsertEventDataProfile(sourceId, sourceProfile);

    await expect(
      mergeEventCandidates(db, {
        targetEventId: target.id,
        sourceEventIds: [sourceId],
        reason: "entity_fingerprint",
        mergedBy: "test",
      }),
    ).rejects.toThrow("Conflicting Event DataProfiles must be reconciled before merge");
    expect(
      await db.selectFrom("events").select("id").where("id", "=", sourceId).executeTakeFirst(),
    ).toBeDefined();
  });

  it("refuses to merge conflicting Scout evidence", async () => {
    const db = await setup();
    const target = await db
      .selectFrom("events")
      .selectAll()
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    const sourceId = randomUUID();
    await db
      .insertInto("events")
      .values({
        ...target,
        id: sourceId,
        slug: "openai-o1-scout-conflict-fixture",
        title: "OpenAI o1 capability expansion through test-time compute",
        status: "review",
        manual_override: 0,
        published_at: null,
      })
      .execute();
    const scoutInsight = await db
      .selectFrom("scout_insights")
      .select("id")
      .executeTakeFirstOrThrow();
    await db
      .deleteFrom("scout_evidence")
      .where("insight_id", "=", scoutInsight.id)
      .where("event_id", "in", [target.id, sourceId])
      .execute();
    await db
      .insertInto("scout_evidence")
      .values([
        {
          insight_id: scoutInsight.id,
          event_id: target.id,
          evidence_role: "trigger",
          weight: 80,
          created_at: "2026-09-20T00:00:00.000Z",
        },
        {
          insight_id: scoutInsight.id,
          event_id: sourceId,
          evidence_role: "contradiction",
          weight: 20,
          created_at: "2026-09-20T00:00:00.000Z",
        },
      ])
      .execute();

    await expect(
      mergeEventCandidates(db, {
        targetEventId: target.id,
        sourceEventIds: [sourceId],
        reason: "entity_fingerprint",
        mergedBy: "test",
      }),
    ).rejects.toThrow("Conflicting Scout evidence must be reconciled before merge");
    expect(
      await db.selectFrom("events").select("id").where("id", "=", sourceId).executeTakeFirst(),
    ).toBeDefined();
  });
});
