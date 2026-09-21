import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { exportStaticSite } from "../src/pipeline/export.js";
import { auditSources } from "../src/pipeline/source-audit.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

describe("static-site privacy boundary", () => {
  it("exports only allowlisted embodied data without private or legacy sentinels", async () => {
    const base = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const temp = await mkdtemp(join(tmpdir(), "agent-pulse-privacy-"));
    const config = { ...base, distDir: join(temp, "dist") };
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    const prioritySource = await db
      .selectFrom("sources")
      .select("id")
      .where("slug", "=", "horizon-holomotion")
      .executeTakeFirstOrThrow();
    const audit = await auditSources(
      db,
      config,
      { sourceId: prioritySource.id },
      { adapterFor: () => ({ kind: "fixture", collect: async () => [] }) },
    );
    const auditJob = await db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", audit.jobId)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(auditJob.details_json).targetSourceIds).toEqual([prioritySource.id]);
    await db
      .updateTable("jobs")
      .set({
        details_json: JSON.stringify({
          ...JSON.parse(auditJob.details_json),
          targetSourceIds: [prioritySource.id, "PRIVATE_TARGET_MEMBER_SENTINEL"],
        }),
      })
      .where("id", "=", audit.jobId)
      .execute();
    await db
      .updateTable("source_checks")
      .set({ contract_fingerprint: "a".repeat(64) })
      .where("source_id", "=", prioritySource.id)
      .execute();

    const legacyEvent = await db
      .selectFrom("events")
      .select("id")
      .where("content_scope", "=", "legacy-ai")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("events")
      .set({
        title: "LEGACY_PUBLIC_SENTINEL",
        readiness_blockers_json: '["/Users/private/readiness"]',
      })
      .where("id", "=", legacyEvent.id)
      .execute();

    const embodiedSignal = await db
      .selectFrom("signals")
      .select("id")
      .where("content_scope", "=", "embodied-data")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("signals")
      .set({ raw_meta_json: '{"ADMIN_TOKEN":"PRIVATE_RAW_SENTINEL"}' })
      .where("id", "=", embodiedSignal.id)
      .execute();

    const retiredSource = await db
      .selectFrom("sources")
      .select("id")
      .where("content_scope", "=", "legacy-ai")
      .where("lifecycle_status", "=", "retired")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("sources")
      .set({ name: "RETIRED_SOURCE_SENTINEL" })
      .where("id", "=", retiredSource.id)
      .execute();

    await exportStaticSite(db, config);

    const dataDir = join(config.distDir, "data");
    const files = (await readdir(dataDir)).sort();
    expect(files).toEqual([
      "assets.json",
      "events.json",
      "evolution.json",
      "peers.json",
      "pipeline.json",
      "product.json",
      "scout.json",
      "sources.json",
    ]);
    const output = (
      await Promise.all(files.map((file) => readFile(join(dataDir, file), "utf8")))
    ).join("\n");

    for (const sentinel of [
      "LEGACY_PUBLIC_SENTINEL",
      "RETIRED_SOURCE_SENTINEL",
      "PRIVATE_RAW_SENTINEL",
      "ADMIN_TOKEN",
      "/Users/private",
      '"content_scope"',
      '"profile_json"',
      '"raw_meta_json"',
      '"config_json"',
      '"contract_fingerprint"',
      '"contractFingerprint"',
      '"targetSourceIds"',
      "PRIVATE_TARGET_MEMBER_SENTINEL",
      "a".repeat(64),
      '"readiness_blockers_json"',
      '"manual_override"',
    ]) {
      expect(output, sentinel).not.toContain(sentinel);
    }

    const events = JSON.parse(await readFile(join(dataDir, "events.json"), "utf8")).events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event: Record<string, unknown>) => !("id" in event))).toBe(true);
    expect(events.every((event: Record<string, unknown>) => "dataProfile" in event)).toBe(true);
  });
});
