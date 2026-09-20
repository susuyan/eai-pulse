import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { embodiedCollectionMethods } from "../src/catalog/embodied-data/collection-methods.js";
import { embodiedDatasets } from "../src/catalog/embodied-data/datasets.js";
import { embodiedEventEvidence } from "../src/catalog/embodied-data/event-evidence.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedPeers } from "../src/catalog/embodied-data/peers.js";
import { embodiedStandards } from "../src/catalog/embodied-data/standards.js";
import { sourceCatalog } from "../src/catalog/sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { canonicalizeUrl } from "../src/domain/url.js";
import {
  applyEmbodiedDataMigration,
  applyVerifiedEmbodiedDataMigration,
  assertMigrationSnapshotMatchesBaseline,
  embodiedPublicFingerprint,
  planEmbodiedDataMigration,
  readEmbodiedDataMigrationBaseline,
} from "../src/pipeline/embodied-data-migration.js";
import {
  restoreRepositorySnapshot,
  writeRepositorySnapshot,
  writeVerifiedRepositorySnapshot,
} from "../src/pipeline/snapshot.js";

const databases: ReturnType<typeof createDatabase>[] = [];
const baselinePath = fileURLToPath(
  new URL("../data/migrations/embodied-data-public-switch-baseline.json", import.meta.url),
);
const operationalTransitionPath = fileURLToPath(
  new URL("../data/migrations/embodied-data-operational-baseline-transition.json", import.meta.url),
);
const operationalTransitionReportPath = fileURLToPath(
  new URL("../data/reports/embodied-data-operational-baseline-transition.json", import.meta.url),
);
const snapshotPath = fileURLToPath(new URL("../data/snapshot/v1.json", import.meta.url));
const evaluationReportPath = fileURLToPath(
  new URL("../data/reports/system-evaluation.json", import.meta.url),
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
  it("binds the operational baseline handoff to the audited main state", async () => {
    const manifest = JSON.parse(await readFile(operationalTransitionPath, "utf8"));
    const report = JSON.parse(await readFile(operationalTransitionReportPath, "utf8"));
    const snapshotHash = createHash("sha256")
      .update(await readFile(snapshotPath))
      .digest("hex");
    const evaluationHash = createHash("sha256")
      .update(await readFile(evaluationReportPath))
      .digest("hex");

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      baseGitSha: "579f5a9799722085c2df2ce2b0c8a48df187d3b2",
      snapshotSha256: snapshotHash,
      evaluationReportSha256: evaluationHash,
    });
    expect(report).toMatchObject({
      schemaVersion: 1,
      baseGitSha: manifest.baseGitSha,
      snapshot: { sha256: snapshotHash },
    });
  });

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

  it("plans and applies without mutating seeded rows when no catalog operations exist", async () => {
    const db = await setup();
    const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);
    const before = await db
      .selectFrom("sources")
      .select(["id", "content_scope", "lifecycle_status", "updated_at"])
      .orderBy("id")
      .execute();

    const planned = await planEmbodiedDataMigration(db, baseline);

    expect(planned.current).toMatchObject({
      sources: sourceCatalog.length,
      signals: new Set(embodiedEventEvidence.map((row) => canonicalizeUrl(row.url))).size,
      events: embodiedLaunchEvents.length,
      actors: embodiedPeers.length,
      eventDataProfiles: embodiedLaunchEvents.length,
      datasets: embodiedDatasets.length,
      standards: embodiedStandards.length,
      collectionMethods: embodiedCollectionMethods.length,
      actorDataCapabilities: embodiedPeers.reduce((sum, peer) => sum + peer.capabilities.length, 0),
    });
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

  it("writes a verified migration snapshot that round-trips current and legacy data", async () => {
    const db = await setup();
    const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-migration-roundtrip-"));
    const expectedFingerprint = await embodiedPublicFingerprint(db);
    const testBaselineSnapshot = await writeRepositorySnapshot(db, root, "baseline.json");
    const testBaseline = { ...baseline, snapshotSha256: testBaselineSnapshot.sha256 };

    const result = await applyVerifiedEmbodiedDataMigration(db, testBaseline, {
      baselineSnapshotPath: join(root, "baseline.json"),
      rootDir: root,
      relativePath: "result.json",
      verifySnapshot: async ({ path, counts, publicFingerprint }) => {
        const verificationDb = await setup();
        const restored = await restoreRepositorySnapshot(verificationDb, root, path);
        expect(restored.counts).toEqual(counts);
        expect(await embodiedPublicFingerprint(verificationDb)).toBe(publicFingerprint);
      },
    });

    expect(result.baselineSnapshotSha256).toBe(testBaseline.snapshotSha256);
    expect(result.resultSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.publicFingerprint).toBe(expectedFingerprint);
    expect(result.roundTripVerified).toBe(true);
    expect(result.before.current).toEqual(result.after.current);
    expect(result.after.current.events).toBe(embodiedLaunchEvents.length);
    expect(await readFile(join(root, "result.json"), "utf8")).toContain(
      '"contentScope":"embodied-data"',
    );
  });

  it("leaves the prior snapshot untouched when candidate verification fails", async () => {
    const db = await setup();
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-migration-rollback-"));
    const target = join(root, "result.json");
    await writeFile(target, "recoverable snapshot\n");

    await expect(
      writeVerifiedRepositorySnapshot(db, root, "result.json", async () => {
        throw new Error("round-trip verification failed");
      }),
    ).rejects.toThrow("round-trip verification failed");
    expect(await readFile(target, "utf8")).toBe("recoverable snapshot\n");
  });
});
