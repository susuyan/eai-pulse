import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintPublicContent } from "../src/cli/public-content-fingerprint.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { buildEmbodiedDataPreview } from "../src/pipeline/embodied-data-preview.js";
import profiles from "./fixtures/embodied-data/data-profiles.json" with { type: "json" };
import cases from "./fixtures/embodied-data/relevance-cases.json" with { type: "json" };

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

describe("embodied data migration preview", () => {
  it("builds and writes an allowlisted read-only preview without changing public content", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    await db.deleteFrom("events").execute();
    await db
      .updateTable("signals")
      .set({ raw_meta_json: JSON.stringify({ secret: "raw-signal-payload-must-not-leak" }) })
      .execute();

    const selectedCases = [cases[0], cases[3], cases[6]] as const;
    const slugs = ["a-include", "b-review", "c-reject"];
    const timestamp = "2026-09-19T12:00:00.000Z";
    for (const [index, fixture] of selectedCases.entries()) {
      if (!fixture) throw new Error(`Missing relevance fixture at index ${index}`);
      await db
        .insertInto("events")
        .values({
          id: `preview-event-${index}`,
          slug: slugs[index] ?? `preview-${index}`,
          title: fixture.input.title,
          fact_summary: fixture.input.summary,
          summary: fixture.input.summary,
          technical_insight: fixture.input.technicalInsight,
          industry_insight: fixture.input.industryInsight,
          future_outlook: "Watch for new verified evidence.",
          business_value: fixture.input.businessValue,
          category: fixture.input.category,
          company: "Preview Fixture",
          keywords_json: JSON.stringify(fixture.input.keywords),
          confidence_score: 80,
          heat_score: 50,
          impact_score: 50,
          value_score: 50,
          score_factors_json: "{}",
          status: "published",
          featured: 0,
          manual_override: 0,
          happened_at: timestamp,
          published_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .execute();
    }

    const repository = new Repository(db);
    await repository.upsertEventDataProfile("preview-event-0", profiles.valid[0]);
    const before = fingerprintPublicContent([await repository.publicEvents()]);

    const preview = await buildEmbodiedDataPreview(db, timestamp);
    const root = await mkdtemp(join(tmpdir(), "embodied-data-preview-"));
    const outputPath = join(root, "var", "embodied-data-preview.json");
    await mkdir(join(root, "var"));
    await writeFile(outputPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
    const serialized = await readFile(outputPath, "utf8");
    const after = fingerprintPublicContent([await repository.publicEvents()]);

    expect(outputPath.startsWith(root)).toBe(true);
    expect(preview).toMatchObject({
      schemaVersion: 1,
      generatedAt: timestamp,
      mode: "read-only-preview",
      counts: { total: 3, include: 1, review: 1, reject: 1, profiled: 1 },
    });
    expect(preview.items.map((item) => item.slug)).toEqual(slugs);
    expect(serialized).not.toContain("raw-signal-payload-must-not-leak");
    expect(serialized).not.toContain("raw_meta_json");
    expect(after).toBe(before);
  });
});
