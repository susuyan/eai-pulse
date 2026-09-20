import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { embodiedCollectionMethods } from "../src/catalog/embodied-data/collection-methods.js";
import { embodiedDatasets } from "../src/catalog/embodied-data/datasets.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedPeers } from "../src/catalog/embodied-data/peers.js";
import { embodiedStandards } from "../src/catalog/embodied-data/standards.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  ActorCapabilityEvidenceRoleSchema,
  ActorDataCapabilitySchema,
  CollectionMethodProfileSchema,
  DatasetProfileSchema,
  StandardProfileSchema,
} from "../src/domain/embodied-data-objects.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

describe("production embodied data object catalog", () => {
  it("defines reusable objects with strict profiles and launch event relations", () => {
    expect(embodiedDatasets.length).toBeGreaterThanOrEqual(12);
    expect(embodiedStandards.length).toBeGreaterThanOrEqual(4);
    expect(embodiedCollectionMethods).toHaveLength(6);

    expect(new Set(embodiedDatasets.map((item) => item.slug)).size).toBe(embodiedDatasets.length);
    expect(new Set(embodiedStandards.map((item) => item.slug)).size).toBe(embodiedStandards.length);
    expect(new Set(embodiedCollectionMethods.map((item) => item.slug)).size).toBe(
      embodiedCollectionMethods.length,
    );

    const eventSlugs = new Set(embodiedLaunchEvents.map((event) => event.slug));
    for (const item of embodiedDatasets) {
      expect(DatasetProfileSchema.parse(item.profile)).toEqual(item.profile);
      expect(item.events.length).toBeGreaterThan(0);
      expect(item.events.every((relation) => eventSlugs.has(relation.eventSlug))).toBe(true);
    }
    for (const item of embodiedStandards) {
      expect(StandardProfileSchema.parse(item.profile)).toEqual(item.profile);
      expect(item.events.length).toBeGreaterThan(0);
      expect(item.events.every((relation) => eventSlugs.has(relation.eventSlug))).toBe(true);
    }
    for (const item of embodiedCollectionMethods) {
      expect(CollectionMethodProfileSchema.parse(item.profile)).toEqual(item.profile);
      expect(item.events.length).toBeGreaterThan(0);
      expect(item.events.every((relation) => eventSlugs.has(relation.eventSlug))).toBe(true);
    }
  });

  it("defines 15 evidence-backed peers without an inferred score", () => {
    expect(embodiedPeers).toHaveLength(15);
    expect(new Set(embodiedPeers.map((peer) => peer.actorSlug)).size).toBe(15);
    expect(embodiedPeers.filter((peer) => peer.region === "CN")).toHaveLength(10);
    expect(embodiedPeers.filter((peer) => peer.region === "GLOBAL")).toHaveLength(5);

    const eventSlugs = new Set(embodiedLaunchEvents.map((event) => event.slug));
    for (const peer of embodiedPeers) {
      expect(peer).not.toHaveProperty("tableScore");
      expect(peer.capabilities.length).toBeGreaterThan(0);
      for (const item of peer.capabilities) {
        expect(ActorDataCapabilitySchema.parse(item.profile)).toEqual(item.profile);
        expect(ActorCapabilityEvidenceRoleSchema.parse(item.evidenceRole)).toBe(item.evidenceRole);
        expect(eventSlugs.has(item.eventSlug)).toBe(true);
        if (item.profile.claimant === "company") {
          expect(item.profile.verificationStatus).toBe("self-claimed");
        }
      }
    }
  });

  it("seeds objects and evidence relations idempotently", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);

    await seedDatabase(db);
    const first = await objectCounts(db);
    await seedDatabase(db);
    const second = await objectCounts(db);

    expect(second).toEqual(first);
    expect(first).toEqual({
      datasets: embodiedDatasets.length,
      datasetEvents: embodiedDatasets.reduce((sum, item) => sum + item.events.length, 0),
      standards: embodiedStandards.length,
      standardEvents: embodiedStandards.reduce((sum, item) => sum + item.events.length, 0),
      collectionMethods: embodiedCollectionMethods.length,
      collectionMethodEvents: embodiedCollectionMethods.reduce(
        (sum, item) => sum + item.events.length,
        0,
      ),
      capabilities: embodiedPeers.reduce((sum, peer) => sum + peer.capabilities.length, 0),
      capabilityEvidence: embodiedPeers.reduce((sum, peer) => sum + peer.capabilities.length, 0),
    });
  });
});

async function objectCounts(db: ReturnType<typeof createDatabase>) {
  const count = async (table: string) => {
    const result = await sql<{
      count: number;
    }>`select count(*) as count from ${sql.table(table)}`.execute(db);
    return Number(result.rows[0]?.count ?? 0);
  };
  return {
    datasets: await count("datasets"),
    datasetEvents: await count("dataset_events"),
    standards: await count("standards"),
    standardEvents: await count("standard_events"),
    collectionMethods: await count("collection_methods"),
    collectionMethodEvents: await count("collection_method_events"),
    capabilities: await count("actor_data_capabilities"),
    capabilityEvidence: await count("actor_capability_evidence"),
  };
}
