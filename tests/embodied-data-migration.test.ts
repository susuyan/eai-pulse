import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  applyEmbodiedDataMigration,
  assertMigrationSnapshotMatchesBaseline,
  planEmbodiedDataMigration,
  readEmbodiedDataMigrationBaseline,
} from "../src/pipeline/embodied-data-migration.js";

const databases: ReturnType<typeof createDatabase>[] = [];
const baselinePath = fileURLToPath(
  new URL("../data/migrations/embodied-data-public-switch-baseline.json", import.meta.url),
);

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

describe("embodied data public switch migration", () => {
  it("strictly parses the verified recovery baseline", async () => {
    const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);

    expect(baseline).toMatchObject({
      schemaVersion: 1,
      baseGitSha: "8ce4b02dec9394d36e4461f0ba55b8041ab233cb",
      snapshotSha256: "3442b18e741e04efcb6ed652ae5f4b9d2843e3dab460452eeb3e68a5700f799b",
      publicFingerprint: "a1ab17715e98c2ca7ca694eb3364c6776a1d6db0d057243ac57cc76167982428",
      pagesRunId: 35498249142,
      pagesUrl: "https://susuyan.github.io/eai-pulse/",
      snapshotCounts: {
        sources: 417,
        signals: 17071,
        events: 4421,
        scoutInsights: 45,
        eventDataProfiles: 0,
        datasets: 0,
        datasetEvents: 0,
        standards: 0,
        standardEvents: 0,
        collectionMethods: 0,
        collectionMethodEvents: 0,
        actorDataCapabilities: 0,
        actorCapabilityEvidence: 0,
      },
    });

    const root = await mkdtemp(join(tmpdir(), "agent-pulse-invalid-baseline-"));
    const invalidPath = join(root, "baseline.json");
    await writeFile(invalidPath, JSON.stringify({ ...baseline, unexpected: true }));
    await expect(readEmbodiedDataMigrationBaseline(invalidPath)).rejects.toThrow(/unexpected/);
  });

  it("plans and applies without mutating current rows when no catalog operations exist", async () => {
    const db = await setup();
    const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);
    const before = await db
      .selectFrom("sources")
      .select(["id", "content_scope", "lifecycle_status", "updated_at"])
      .orderBy("id")
      .execute();

    const planned = await planEmbodiedDataMigration(db, baseline);

    expect(planned.current).toMatchObject({ sources: 0, signals: 0, events: 0, actors: 0 });
    expect(planned.legacy.sources).toBeGreaterThan(0);
    expect(planned.changes).toEqual({ inserted: 0, updated: 0, relations: 0 });
    expect(
      await db
        .selectFrom("sources")
        .select(["id", "content_scope", "lifecycle_status", "updated_at"])
        .orderBy("id")
        .execute(),
    ).toEqual(before);

    const applied = await applyEmbodiedDataMigration(db, baseline);
    expect(applied).toEqual(planned);
    expect(
      await db
        .selectFrom("sources")
        .select(["id", "content_scope", "lifecycle_status", "updated_at"])
        .orderBy("id")
        .execute(),
    ).toEqual(before);

    const secondPlan = await planEmbodiedDataMigration(db, baseline);
    expect(secondPlan.changes).toEqual({ inserted: 0, updated: 0, relations: 0 });
    expect(secondPlan.retired).toEqual(planned.retired);
  });

  it("rejects apply when the source snapshot does not match the recovery baseline", async () => {
    const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-migration-hash-"));
    const snapshotPath = join(root, "v1.json");
    await writeFile(snapshotPath, "{}\n");

    await expect(assertMigrationSnapshotMatchesBaseline(baseline, snapshotPath)).rejects.toThrow(
      /snapshot hash mismatch/i,
    );

    const verifiedPath = join(root, "verified.json");
    const payload = "verified snapshot\n";
    const verifiedBaseline = {
      ...baseline,
      snapshotSha256: createHash("sha256").update(payload).digest("hex"),
    };
    await writeFile(verifiedPath, payload);
    await expect(
      assertMigrationSnapshotMatchesBaseline(verifiedBaseline, verifiedPath),
    ).resolves.toBeUndefined();
    expect(await readFile(verifiedPath, "utf8")).toBe(payload);
  });
});
