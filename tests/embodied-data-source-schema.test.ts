import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function setup(seed = false) {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  if (seed) await seedDatabase(db);
  return db;
}

describe("embodied source governance schema", () => {
  it("persists governance fields and gives restored legacy rows safe defaults", async () => {
    const db = await setup();
    const sourceTable = (await db.introspection.getTables()).find(
      (table) => table.name === "sources",
    );
    for (const name of ["owner", "robots_policy", "freshness_slo_hours", "adapter_version"]) {
      expect(sourceTable?.columns.find((column) => column.name === name)).toMatchObject({
        isNullable: false,
        hasDefaultValue: true,
      });
    }

    await db
      .insertInto("sources")
      .values({
        id: "legacy-source",
        slug: "legacy-source",
        name: "Legacy Source",
        homepage_url: "https://example.com",
        adapter: "rss",
        tier: 2,
        role: "research",
        region: "GLOBAL",
        language: "en",
        authority_score: 70,
        enabled: 0,
        config_json: JSON.stringify({ url: "https://example.com/feed.xml" }),
        state_json: "{}",
        last_collected_at: null,
        last_success_at: null,
        last_error: null,
        created_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T00:00:00.000Z",
      })
      .execute();

    expect(
      await db
        .selectFrom("sources")
        .select(["owner", "robots_policy", "freshness_slo_hours", "adapter_version"])
        .where("id", "=", "legacy-source")
        .executeTakeFirstOrThrow(),
    ).toEqual({
      owner: "Unknown owner",
      robots_policy: "Review required",
      freshness_slo_hours: 168,
      adapter_version: "1",
    });
  });

  it("seeds governed embodied sources and keeps legacy sources retired", async () => {
    const db = await setup(true);
    const sources = await new Repository(db).listSources();
    const current = sources.filter((source) => source.content_scope === "embodied-data");
    const legacy = sources.filter((source) => source.content_scope === "legacy-ai");

    expect(current.length).toBeGreaterThanOrEqual(30);
    expect(
      current.every(
        (source) =>
          ["draft", "shadow"].includes(source.lifecycle_status) &&
          source.owner.length > 1 &&
          source.robots_policy.length > 10 &&
          source.freshness_slo_hours > 0 &&
          /^\d+$/.test(source.adapter_version),
      ),
    ).toBe(true);
    expect(legacy.length).toBeGreaterThan(0);
    expect(
      legacy.every(
        (source) =>
          source.enabled === 0 &&
          source.observation_enabled === 0 &&
          source.lifecycle_status === "retired" &&
          source.maintenance_status === "retired",
      ),
    ).toBe(true);
  });

  it("soft-retires stale sources without deleting run or check history", async () => {
    const db = await setup(true);
    const repository = new Repository(db);
    await db
      .insertInto("sources")
      .values({
        id: "stale-source-id",
        slug: "stale-generic-ai",
        name: "Stale Generic AI",
        homepage_url: "https://example.com/stale",
        adapter: "rss",
        tier: 2,
        role: "research",
        region: "GLOBAL",
        language: "en",
        authority_score: 60,
        enabled: 1,
        observation_enabled: 1,
        config_json: JSON.stringify({ url: "https://example.com/stale/feed.xml" }),
        state_json: "{}",
        last_collected_at: null,
        last_success_at: null,
        last_error: null,
        lifecycle_status: "active",
        content_scope: "legacy-ai",
        created_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T00:00:00.000Z",
      })
      .execute();
    const jobId = await repository.startJob("collect", "stale-source-id");
    const runId = await repository.startSourceRun("stale-source-id", jobId);
    await repository.finishSourceRun(runId, {
      status: "succeeded",
      attemptCount: 1,
      durationMs: 10,
      collected: 1,
      created: 1,
      skipped: 0,
      httpStatus: 200,
      responseBytes: 100,
    });
    await repository.insertSourceCheck({
      id: "stale-check",
      source_id: "stale-source-id",
      job_id: jobId,
      status: "healthy",
      adapter: "rss",
      adapter_version: "1",
      access_status: "reachable",
      fetch_status: "succeeded",
      parse_status: "succeeded",
      schema_status: "valid",
      policy_status: "allowed_metadata",
      http_status: 200,
      final_url: "https://example.com/feed.xml",
      content_type: "application/rss+xml",
      response_bytes: 100,
      item_count: 1,
      duplicate_count: 0,
      duplicate_ratio_bps: 0,
      quality_score: 90,
      latest_item_at: "2026-09-20T00:00:00.000Z",
      freshness_hours: 1,
      error_type: null,
      error_code: null,
      error_summary: null,
      repair_action: "none",
      proxy_hint: "not_required",
      proxy_used: 0,
      retention_decision: "keep",
      recommended_lifecycle: "shadow",
      sample_json: "{}",
      started_at: "2026-09-20T00:00:00.000Z",
      finished_at: "2026-09-20T00:00:01.000Z",
      duration_ms: 1000,
    });

    await seedDatabase(db);

    expect(await repository.getSource("stale-source-id")).toMatchObject({
      slug: "stale-generic-ai",
      enabled: 0,
      observation_enabled: 0,
      lifecycle_status: "retired",
      maintenance_status: "retired",
      content_scope: "legacy-ai",
    });
    expect((await repository.listSourceRuns("stale-source-id")).length).toBe(1);
    expect((await repository.listSourceChecks("stale-source-id")).length).toBe(1);
  });
});
