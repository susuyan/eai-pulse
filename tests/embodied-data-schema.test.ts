import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import profiles from "./fixtures/embodied-data/data-profiles.json" with { type: "json" };

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

describe("embodied data database foundation", () => {
  it("defaults existing content tables to the legacy AI scope", async () => {
    const db = await setup();
    const tables = await db.introspection.getTables();

    for (const tableName of ["sources", "signals", "events", "actors"]) {
      const table = tables.find((item) => item.name === tableName);
      const column = table?.columns.find((item) => item.name === "content_scope");
      expect(column).toMatchObject({ isNullable: false, hasDefaultValue: true });

      const result = await sql<{ contentScope: string }>`
        select content_scope as contentScope
        from ${sql.table(tableName)}
        limit 1
      `.execute(db);
      expect(result.rows[0]?.contentScope).toBe("legacy-ai");
    }
  });

  it("cascades an Event deletion to its DataProfile", async () => {
    const db = await setup();
    const event = await db.selectFrom("events").select("id").executeTakeFirstOrThrow();
    const timestamp = "2026-09-19T00:00:00.000Z";

    await sql`
      insert into event_data_profiles (
        event_id,
        profile_json,
        schema_version,
        created_at,
        updated_at
      ) values (
        ${event.id},
        ${JSON.stringify({ pipelineStages: ["acquisition-route"] })},
        1,
        ${timestamp},
        ${timestamp}
      )
    `.execute(db);

    await db.deleteFrom("events").where("id", "=", event.id).execute();
    const result = await sql<{ count: number }>`
      select count(*) as count from event_data_profiles where event_id = ${event.id}
    `.execute(db);

    expect(Number(result.rows[0]?.count)).toBe(0);
  });

  it("validates DataProfiles on write and read and filters Events by scope", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const event = await db.selectFrom("events").selectAll().executeTakeFirstOrThrow();
    const profile = profiles.valid[0];

    await repository.updateEvent(event.id, { content_scope: "embodied-data" });
    await repository.upsertEventDataProfile(event.id, profile);

    expect(await repository.getEventDataProfile(event.id)).toEqual(profile);
    expect(await repository.listEventsByContentScope("embodied-data", event.status)).toContainEqual(
      expect.objectContaining({ id: event.id }),
    );

    const invalidProfile = { ...profile, pipelineStages: [] };
    await expect(repository.upsertEventDataProfile(event.id, invalidProfile)).rejects.toThrow();
    expect(await repository.getEventDataProfile(event.id)).toEqual(profile);
  });
});
