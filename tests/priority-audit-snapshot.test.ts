import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { embodiedPrioritySourceSlugs } from "../src/catalog/embodied-data/priority-sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { sha256 } from "../src/domain/url.js";
import { restoreRepositorySnapshot, writeRepositorySnapshot } from "../src/pipeline/snapshot.js";
import { auditSources } from "../src/pipeline/source-audit.js";

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
  return { db, config };
}
async function artifact() {
  const { db, config } = await setup();
  const sources = await db
    .selectFrom("sources")
    .selectAll()
    .where("slug", "in", embodiedPrioritySourceSlugs)
    .execute();
  await auditSources(db, config, {
    sourceIds: sources.map((source) => source.id),
    policies: Object.fromEntries(sources.map((source) => [source.id, "pending"])),
  });
  const directory = await mkdtemp(join(tmpdir(), "priority-audit-snapshot-"));
  const file = join(directory, "snapshot.json");
  await writeRepositorySnapshot(db, directory, file);
  return { db, sources, directory, file, snapshot: JSON.parse(await readFile(file, "utf8")) };
}

describe("governed priority audit snapshot", () => {
  it("restores complete target membership and checks with remapped private identities", async () => {
    const { db, sources, directory, file, snapshot } = await artifact();
    expect(snapshot.priorityAuditEvidence).toHaveLength(1);
    const serialized = JSON.stringify(snapshot.priorityAuditEvidence);
    const originalJobs = await db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "source-audit")
      .execute();
    const originalChecks = await db.selectFrom("source_checks").selectAll().execute();
    for (const privateValue of [
      ...sources.map((row) => row.id),
      ...originalJobs.map((row) => row.id),
      ...originalChecks.map((row) => row.id),
    ])
      expect(serialized).not.toContain(privateValue);
    for (const field of ["sample", "raw", "config", "errorSummary", "targetSourceIds"])
      expect(serialized).not.toContain(`"${field}"`);
    expect(snapshot.sourceChecks).toHaveLength(0);
    const target = await setup();
    await restoreRepositorySnapshot(target.db, directory, file);
    await restoreRepositorySnapshot(target.db, directory, file);
    const jobs = await target.db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "source-audit")
      .execute();
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    if (!job) throw new Error("Missing restored audit");
    expect(job.id).not.toBe(originalJobs[0]?.id);
    expect(JSON.parse(job.details_json)).toMatchObject({
      auditComplete: true,
      expectedSourceCount: 12,
    });
    expect(
      await target.db
        .selectFrom("source_checks")
        .selectAll()
        .where("job_id", "=", job.id)
        .execute(),
    ).toHaveLength(12);
    await writeRepositorySnapshot(target.db, directory, join(directory, "roundtrip.json"));
    const again = JSON.parse(await readFile(join(directory, "roundtrip.json"), "utf8"));
    expect(again.priorityAuditEvidence).toEqual(snapshot.priorityAuditEvidence);
  });

  it.each([
    "unknown",
    "duplicate",
    "private",
    "hash",
    "target-order",
    "check-order",
  ])("rejects %s evidence before restoring any jobs", async (mode) => {
    const { directory, file, snapshot } = await artifact();
    const evidence = snapshot.priorityAuditEvidence[0];
    if (mode === "unknown") evidence.targetSlugs[0] = "unknown-private-source";
    if (mode === "duplicate") evidence.checks.push(evidence.checks[0]);
    if (mode === "private") evidence.sample = "PRIVATE_SENTINEL";
    if (mode === "hash") evidence.contentHash = "0".repeat(64);
    if (mode === "target-order") evidence.targetSlugs.reverse();
    if (mode === "check-order") evidence.checks.reverse();
    if (["duplicate", "target-order", "check-order"].includes(mode)) {
      const { contentHash: _previous, ...payload } = evidence;
      evidence.contentHash = sha256(JSON.stringify(payload));
    }
    await writeFile(file, JSON.stringify(snapshot));
    const target = await setup();
    await expect(restoreRepositorySnapshot(target.db, directory, file)).rejects.toThrow();
    expect(
      await target.db.selectFrom("jobs").selectAll().where("type", "=", "source-audit").execute(),
    ).toHaveLength(0);
  });

  it("rejects inconsistent completed job metadata instead of manufacturing completeness", async () => {
    const { db, directory, file } = await artifact();
    const job = await db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "source-audit")
      .executeTakeFirstOrThrow();
    const details = JSON.parse(job.details_json);
    await db
      .updateTable("jobs")
      .set({ details_json: JSON.stringify({ ...details, errors: "invalid" }) })
      .where("id", "=", job.id)
      .execute();
    await expect(writeRepositorySnapshot(db, directory, file)).rejects.toThrow();
  });

  it("rejects noncanonical record ordering before restore can reorder accepted history", async () => {
    const { directory, file, snapshot } = await artifact();
    const original = snapshot.priorityAuditEvidence[0];
    const earlier = structuredClone(original);
    earlier.startedAt = new Date(Date.parse(original.startedAt) - 1000).toISOString();
    earlier.runHash = sha256(
      JSON.stringify({ startedAt: earlier.startedAt, targetSlugs: earlier.targetSlugs }),
    );
    const { contentHash: _previous, ...payload } = earlier;
    earlier.contentHash = sha256(JSON.stringify(payload));
    snapshot.priorityAuditEvidence = [original, earlier].sort((a, b) =>
      b.runHash.localeCompare(a.runHash),
    );
    await writeFile(file, JSON.stringify(snapshot));
    const target = await setup();
    await expect(restoreRepositorySnapshot(target.db, directory, file)).rejects.toThrow();
  });

  it("rejects a conflicting existing audit without changing its checks", async () => {
    const { db, directory, file } = await artifact();
    const target = await setup();
    await restoreRepositorySnapshot(target.db, directory, file);
    const before = await target.db.selectFrom("source_checks").selectAll().execute();
    await db.updateTable("source_checks").set({ item_count: 9 }).execute();
    await writeRepositorySnapshot(db, directory, file);
    await expect(restoreRepositorySnapshot(target.db, directory, file)).rejects.toThrow(
      "Conflicting",
    );
    expect(await target.db.selectFrom("source_checks").selectAll().execute()).toEqual(before);
  });

  it("preserves a running target with no persisted check", async () => {
    const { db, directory, file, sources } = await artifact();
    const job = await db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "source-audit")
      .executeTakeFirstOrThrow();
    await db
      .deleteFrom("source_checks")
      .where("source_id", "=", sources[0]?.id ?? "")
      .execute();
    await db
      .updateTable("jobs")
      .set({
        status: "running",
        finished_at: null,
        collected_count: 0,
        created_count: 0,
        skipped_count: 0,
        error_count: 0,
        details_json: JSON.stringify({
          targetSourceIds: sources.map((source) => source.id),
          expectedSourceCount: 12,
          auditComplete: false,
        }),
      })
      .where("id", "=", job.id)
      .execute();
    await writeRepositorySnapshot(db, directory, file);
    const target = await setup();
    await restoreRepositorySnapshot(target.db, directory, file);
    const restored = await target.db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "source-audit")
      .executeTakeFirstOrThrow();
    expect(restored.status).toBe("running");
    expect(JSON.parse(restored.details_json).targetSourceIds).toHaveLength(12);
    expect(
      await target.db
        .selectFrom("source_checks")
        .selectAll()
        .where("job_id", "=", restored.id)
        .execute(),
    ).toHaveLength(11);
  });
});
