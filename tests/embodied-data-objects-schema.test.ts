import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
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

describe("embodied data object persistence", () => {
  it("creates the eight object and relation tables", async () => {
    const db = await setup();
    const tables = new Set((await db.introspection.getTables()).map((table) => table.name));

    for (const table of [
      "datasets",
      "dataset_events",
      "standards",
      "standard_events",
      "collection_methods",
      "collection_method_events",
      "actor_data_capabilities",
      "actor_capability_evidence",
    ]) {
      expect(tables.has(table)).toBe(true);
    }
  });

  it("keeps object identity and actor capability keys unique", async () => {
    const db = await setup();
    const timestamp = "2026-09-19T00:00:00.000Z";
    await db
      .insertInto("datasets")
      .values({
        id: "dataset-1",
        slug: "fixture-dataset",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await expect(
      db
        .insertInto("datasets")
        .values({
          id: "dataset-2",
          slug: "fixture-dataset",
          profile_json: "{}",
          created_at: timestamp,
          updated_at: timestamp,
        })
        .execute(),
    ).rejects.toThrow();

    const actor = await db.selectFrom("actors").select("id").executeTakeFirstOrThrow();
    await db
      .insertInto("actor_data_capabilities")
      .values({
        id: "capability-1",
        actor_id: actor.id,
        capability_key: "fixture-capability",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await expect(
      db
        .insertInto("actor_data_capabilities")
        .values({
          id: "capability-2",
          actor_id: actor.id,
          capability_key: "fixture-capability",
          profile_json: "{}",
          created_at: timestamp,
          updated_at: timestamp,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("deletes Event relations without deleting long-lived objects", async () => {
    const db = await setup();
    const timestamp = "2026-09-19T00:00:00.000Z";
    const event = await db.selectFrom("events").select("id").executeTakeFirstOrThrow();
    const actor = await db.selectFrom("actors").select("id").executeTakeFirstOrThrow();
    await db
      .insertInto("datasets")
      .values({
        id: "dataset-1",
        slug: "fixture-dataset",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("standards")
      .values({
        id: "standard-1",
        slug: "fixture-standard",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("collection_methods")
      .values({
        id: "method-1",
        slug: "fixture-method",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("actor_data_capabilities")
      .values({
        id: "capability-1",
        actor_id: actor.id,
        capability_key: "fixture-capability",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("dataset_events")
      .values({
        dataset_id: "dataset-1",
        event_id: event.id,
        relation_role: "release",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("standard_events")
      .values({
        standard_id: "standard-1",
        event_id: event.id,
        relation_role: "publication",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("collection_method_events")
      .values({
        collection_method_id: "method-1",
        event_id: event.id,
        relation_role: "demonstration",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("actor_capability_evidence")
      .values({
        capability_id: "capability-1",
        event_id: event.id,
        evidence_role: "claim",
        created_at: timestamp,
      })
      .execute();

    await db.deleteFrom("events").where("id", "=", event.id).execute();

    expect(await countRows(db, "datasets")).toBe(1);
    expect(await countRows(db, "standards")).toBe(1);
    expect(await countRows(db, "collection_methods")).toBe(1);
    expect(await countRows(db, "actor_data_capabilities")).toBe(1);
    expect(await countRows(db, "dataset_events")).toBe(0);
    expect(await countRows(db, "standard_events")).toBe(0);
    expect(await countRows(db, "collection_method_events")).toBe(0);
    expect(await countRows(db, "actor_capability_evidence")).toBe(0);
  });

  it("cascades owned relations when an object or Actor is deleted", async () => {
    const db = await setup();
    const timestamp = "2026-09-19T00:00:00.000Z";
    const event = await db.selectFrom("events").select("id").executeTakeFirstOrThrow();
    const actor = await db.selectFrom("actors").select("id").executeTakeFirstOrThrow();
    await db
      .insertInto("datasets")
      .values({
        id: "dataset-1",
        slug: "fixture-dataset",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("standards")
      .values({
        id: "standard-1",
        slug: "fixture-standard",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("collection_methods")
      .values({
        id: "method-1",
        slug: "fixture-method",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("dataset_events")
      .values({
        dataset_id: "dataset-1",
        event_id: event.id,
        relation_role: "release",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("standard_events")
      .values({
        standard_id: "standard-1",
        event_id: event.id,
        relation_role: "publication",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("collection_method_events")
      .values({
        collection_method_id: "method-1",
        event_id: event.id,
        relation_role: "demonstration",
        created_at: timestamp,
      })
      .execute();
    await db
      .insertInto("actor_data_capabilities")
      .values({
        id: "capability-1",
        actor_id: actor.id,
        capability_key: "fixture-capability",
        profile_json: "{}",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("actor_capability_evidence")
      .values({
        capability_id: "capability-1",
        event_id: event.id,
        evidence_role: "verification",
        created_at: timestamp,
      })
      .execute();

    await db.deleteFrom("datasets").where("id", "=", "dataset-1").execute();
    await db.deleteFrom("standards").where("id", "=", "standard-1").execute();
    await db.deleteFrom("collection_methods").where("id", "=", "method-1").execute();
    await db.deleteFrom("actors").where("id", "=", actor.id).execute();

    expect(await countRows(db, "dataset_events")).toBe(0);
    expect(await countRows(db, "standard_events")).toBe(0);
    expect(await countRows(db, "collection_method_events")).toBe(0);
    expect(await countRows(db, "actor_data_capabilities")).toBe(0);
    expect(await countRows(db, "actor_capability_evidence")).toBe(0);
    expect(
      await db.selectFrom("events").select("id").where("id", "=", event.id).executeTakeFirst(),
    ).toBeDefined();
  });

  it("validates, upserts and links reusable domain objects", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const event = await db.selectFrom("events").select("id").executeTakeFirstOrThrow();
    const datasetFixture = datasets[0];
    const standardFixture = standards[0];
    const methodFixture = collectionMethods[0];
    if (!datasetFixture || !standardFixture || !methodFixture) throw new Error("Missing fixture");

    const datasetId = await repository.upsertDataset(datasetFixture.slug, datasetFixture.profile);
    const standardId = await repository.upsertStandard(
      standardFixture.slug,
      standardFixture.profile,
    );
    const methodId = await repository.upsertCollectionMethod(
      methodFixture.slug,
      methodFixture.profile,
    );
    await repository.linkDatasetEvent(datasetId, event.id, "release");
    await repository.linkDatasetEvent(datasetId, event.id, "release");
    await repository.linkStandardEvent(standardId, event.id, "publication");
    await repository.linkStandardEvent(standardId, event.id, "publication");
    await repository.linkCollectionMethodEvent(methodId, event.id, "demonstration");
    await repository.linkCollectionMethodEvent(methodId, event.id, "demonstration");

    expect(await repository.getDatasetBySlug(datasetFixture.slug)).toMatchObject({
      id: datasetId,
      slug: datasetFixture.slug,
      profile: datasetFixture.profile,
    });
    expect(await repository.listDatasets()).toHaveLength(1);
    expect(await repository.getStandardBySlug(standardFixture.slug)).toMatchObject({
      id: standardId,
      profile: standardFixture.profile,
    });
    expect(await repository.listStandards()).toHaveLength(1);
    expect(await repository.getCollectionMethodBySlug(methodFixture.slug)).toMatchObject({
      id: methodId,
      profile: methodFixture.profile,
    });
    expect(await repository.listCollectionMethods()).toHaveLength(1);
    expect(await countRows(db, "dataset_events")).toBe(1);
    expect(await countRows(db, "standard_events")).toBe(1);
    expect(await countRows(db, "collection_method_events")).toBe(1);

    await expect(
      repository.upsertDataset(datasetFixture.slug, {
        ...datasetFixture.profile,
        canonicalUrl: "http://example.com/unsafe",
      }),
    ).rejects.toThrow();
    expect((await repository.getDatasetBySlug(datasetFixture.slug))?.profile).toEqual(
      datasetFixture.profile,
    );
  });

  it("derives PeerCompanyProfile without treating Actor collection as capability proof", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const actors = await db.selectFrom("actors").select(["id", "slug"]).limit(2).execute();
    const actor = actors[0];
    const emptyActor = actors[1];
    const event = await db.selectFrom("events").select("id").executeTakeFirstOrThrow();
    const capability = actorCapabilities[0];
    if (!actor || !emptyActor || !capability) throw new Error("Missing fixture");

    const capabilityId = await repository.upsertActorDataCapability(actor.id, capability);
    await repository.linkActorCapabilityEvidence(capabilityId, event.id, "claim");
    await repository.linkActorCapabilityEvidence(capabilityId, event.id, "claim");

    expect(await repository.listActorDataCapabilities(actor.id)).toEqual([capability]);
    expect(await repository.getPeerCompanyProfile(actor.id)).toMatchObject({
      actorId: actor.id,
      actorSlug: actor.slug,
      capabilities: [capability],
    });
    expect(await repository.getPeerCompanyProfile(emptyActor.id)).toMatchObject({
      actorId: emptyActor.id,
      actorSlug: emptyActor.slug,
      capabilities: [],
    });
    expect(await countRows(db, "actor_capability_evidence")).toBe(1);
  });
});

async function countRows(db: ReturnType<typeof createDatabase>, table: string): Promise<number> {
  const result = await sql<{
    count: number;
  }>`select count(*) as count from ${sql.table(table)}`.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}
