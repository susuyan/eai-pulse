import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkFreshness } from "../src/cli/monitor-check.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { evaluateVersionedFreshness } from "../src/pipeline/evaluation-policy.js";
import { buildSystemEvaluationReport } from "../src/pipeline/evaluation-progress.js";
import { generateMonitorReport, isCritical } from "../src/pipeline/monitor.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("versioned evaluation freshness", () => {
  it("does not let unhealthy draft and shadow scores create a production incident", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      await db
        .updateTable("sources")
        .set({
          lifecycle_status: "draft",
          health_score: 0,
          last_success_at: new Date().toISOString(),
        })
        .execute();
      await db
        .updateTable("sources")
        .set({ lifecycle_status: "active", health_score: 80 })
        .where("slug", "=", "openai")
        .execute();
      await db
        .updateTable("sources")
        .set({ lifecycle_status: "shadow" })
        .where("slug", "=", "robocasa")
        .execute();
      const report = await generateMonitorReport(db);
      expect(report.avgHealthScore).toBe(80);
      expect(isCritical(report)).toBe(false);
      await db
        .updateTable("sources")
        .set({ health_score: 10 })
        .where("slug", "=", "openai")
        .execute();
      expect(isCritical(await generateMonitorReport(db))).toBe(true);
    } finally {
      await db.destroy();
    }
  });
  it.each([
    "operational",
    "change",
  ] as const)("validates the persisted %s mode at the Monitor authority boundary", async (gateMode) => {
    const directory = await mkdtemp(join(tmpdir(), "monitor-watermark-"));
    directories.push(directory);
    await mkdir(join(directory, "data/snapshot"), { recursive: true });
    await mkdir(join(directory, "data/reports"), { recursive: true });
    await writeFile(join(directory, "data/snapshot/v1.json"), "{}");
    const now = new Date("2026-09-20T12:00:00Z");
    const report = buildSystemEvaluationReport(
      {
        id: "test",
        releaseVersion: "test",
        status: "partial",
        overallScore: 60,
        rawWeightedScore: 60,
        evidenceCoverage: 50,
        dimensions: [],
        capabilities: [],
        notes: "test",
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
      },
      { asOf: now, gateMode, persist: false },
    );
    await writeFile(join(directory, "data/reports/system-evaluation.json"), JSON.stringify(report));
    expect(await checkFreshness(directory, 60, now)).toMatchObject(
      gateMode === "change"
        ? {
            status: "critical",
            detail: { reasonCode: "evaluation_report_invalid", refreshEligible: false },
          }
        : { status: "ok", detail: { ageMinutes: 0 } },
    );
  });

  it("stays critical when checkout mtime is fresh but the report is old", () => {
    expect(
      evaluateVersionedFreshness({
        evaluationAsOf: "2026-09-17T11:59:59.000Z",
        fileMtime: "2026-09-20T11:59:59.000Z",
        now: new Date("2026-09-20T12:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "critical",
      detail: {
        evaluationAsOf: "2026-09-17T11:59:59.000Z",
        fileMtime: "2026-09-20T11:59:59.000Z",
        ageMinutes: 4_320,
        reasonCode: "evaluation_persistently_stale",
      },
    });
  });

  it("stays healthy when the report is fresh but checkout mtime is old", () => {
    expect(
      evaluateVersionedFreshness({
        evaluationAsOf: "2026-09-20T11:30:00.000Z",
        fileMtime: "2026-08-26T12:00:00.000Z",
        now: new Date("2026-09-20T12:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "ok",
      detail: {
        evaluationAsOf: "2026-09-20T11:30:00.000Z",
        fileMtime: "2026-08-26T12:00:00.000Z",
        ageMinutes: 30,
      },
    });
  });

  it("uses the recomputed score instead of the persisted report score", async () => {
    const directory = await mkdtemp(join(tmpdir(), "monitor-current-score-"));
    directories.push(directory);
    await mkdir(join(directory, "data/snapshot"), { recursive: true });
    await mkdir(join(directory, "data/reports"), { recursive: true });
    await writeFile(join(directory, "data/snapshot/v1.json"), "{}");
    const now = new Date("2026-09-20T12:00:00.000Z");
    const report = buildSystemEvaluationReport(
      {
        id: "persisted",
        releaseVersion: "test",
        status: "partial",
        overallScore: 62,
        rawWeightedScore: 62,
        evidenceCoverage: 50,
        dimensions: [],
        capabilities: [],
        notes: "persisted score",
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
      },
      { asOf: now, gateMode: "operational", persist: false },
    );
    await writeFile(join(directory, "data/reports/system-evaluation.json"), JSON.stringify(report));

    expect(await checkFreshness(directory, 59, now)).toMatchObject({
      status: "critical",
      detail: {
        reasonCodes: ["system_score_below_floor"],
        fingerprint: "6ffc8d32a0274c62",
      },
    });
  });
});
