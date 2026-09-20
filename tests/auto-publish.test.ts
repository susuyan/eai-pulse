import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { autoAdvanceScout, autoPublishReadyEvents } from "../src/pipeline/auto-publish.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function database() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return db;
}

describe("autonomous publication", () => {
  it("publishes ready events but leaves blocked events isolated", async () => {
    const db = await database();
    const ready = await db
      .selectFrom("events")
      .select("id")
      .where("slug", "=", "droid-distributed-collection")
      .executeTakeFirstOrThrow();
    const blocked = await db
      .selectFrom("events")
      .select("id")
      .where("slug", "=", "rh20t-force-aware-capture")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("events")
      .set({
        status: "review",
        published_at: null,
        title: "Dexterous robot teleoperation dataset released",
        fact_summary:
          "The dataset contains verified demonstration hours from robot teleoperation tasks.",
        summary:
          "The release provides robot data collection methods and synchronized multimodal records.",
        technical_insight: "RGB-D, joint state, and force-torque streams preserve aligned actions.",
        industry_insight:
          "The release creates a reproducible reference for large-scale robot data collection.",
      })
      .where("id", "=", ready.id)
      .execute();
    await db
      .updateTable("events")
      .set({ status: "review", published_at: null, technical_insight: "待编辑：补充技术判断" })
      .where("id", "=", blocked.id)
      .execute();

    const result = await autoPublishReadyEvents(db);

    expect(result.published).toBeGreaterThanOrEqual(1);
    expect(
      await db.selectFrom("events").select("status").where("id", "=", ready.id).executeTakeFirst(),
    ).toEqual({ status: "published" });
    expect(
      await db
        .selectFrom("events")
        .select(["status", "readiness_blockers_json"])
        .where("id", "=", blocked.id)
        .executeTakeFirst(),
    ).toEqual({
      status: "review",
      readiness_blockers_json: expect.stringContaining("placeholder_content"),
    });
  });

  it("never republishes legacy review events", async () => {
    const db = await database();
    const legacy = await db
      .selectFrom("events")
      .select("id")
      .where("slug", "=", "openai-o1-test-time-reasoning")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("events")
      .set({ status: "review", published_at: null })
      .where("id", "=", legacy.id)
      .execute();

    await autoPublishReadyEvents(db);

    const result = await db
      .selectFrom("events")
      .select(["status", "readiness_blockers_json"])
      .where("id", "=", legacy.id)
      .executeTakeFirstOrThrow();
    expect(result.status).toBe("review");
    expect(JSON.parse(result.readiness_blockers_json)).toEqual(
      expect.arrayContaining(["legacy_scope", "missing_data_profile"]),
    );
  });

  it("publishes or archives old Scout inbox items without a human queue", async () => {
    const db = await database();
    const insight = await db.selectFrom("scout_insights").select("id").executeTakeFirstOrThrow();
    await db
      .updateTable("scout_insights")
      .set({ status: "inbox", published_at: null })
      .where("id", "=", insight.id)
      .execute();
    expect(await autoAdvanceScout(db)).toMatchObject({ published: 1, archived: 0 });

    await db
      .updateTable("scout_insights")
      .set({ status: "inbox", published_at: null, total_score: 20 })
      .where("id", "=", insight.id)
      .execute();
    expect(await autoAdvanceScout(db)).toMatchObject({ published: 0, archived: 1 });
  });

  it("keeps the Control Room free of manual publication decisions", async () => {
    const content = `${await readFile("web/admin/index.html", "utf8")}\n${await readFile("web/admin/admin.js", "utf8")}`;
    for (const forbidden of ["细看", "接受", "忽略", "编辑 / 发布", "确认继续", "window.confirm"]) {
      expect(content).not.toContain(forbidden);
    }
  });
});
