import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";

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
    expect(await countRows(db, "actor_data_capabilities")).toBe(1);
    expect(await countRows(db, "dataset_events")).toBe(0);
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
      .insertInto("dataset_events")
      .values({
        dataset_id: "dataset-1",
        event_id: event.id,
        relation_role: "release",
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
    await db.deleteFrom("actors").where("id", "=", actor.id).execute();

    expect(await countRows(db, "dataset_events")).toBe(0);
    expect(await countRows(db, "actor_data_capabilities")).toBe(0);
    expect(await countRows(db, "actor_capability_evidence")).toBe(0);
    expect(
      await db.selectFrom("events").select("id").where("id", "=", event.id).executeTakeFirst(),
    ).toBeDefined();
  });
});

async function countRows(db: ReturnType<typeof createDatabase>, table: string): Promise<number> {
  const result = await sql<{
    count: number;
  }>`select count(*) as count from ${sql.table(table)}`.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}
