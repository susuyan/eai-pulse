import { afterEach, describe, expect, it } from "vitest";
import { embodiedPrioritySourceSlugs } from "../src/catalog/embodied-data/priority-sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  buildPrioritySourceHealthReport,
  priorityReportFreshness,
  validatePrioritySourceHealthReport,
} from "../src/pipeline/priority-source-health.js";
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

describe("priority source audit boundaries", () => {
  it("enforces reviewed policy for direct callers even when an override requests access", async () => {
    const { db, config } = await setup();
    const source = await db
      .selectFrom("sources")
      .selectAll()
      .where("slug", "=", "samr-standards")
      .executeTakeFirstOrThrow();
    let requests = 0;
    const report = await auditSources(
      db,
      config,
      { sourceIds: [source.id], policies: { [source.id]: "allowed_metadata" } },
      {
        fetcher: async () => {
          requests++;
          throw new Error("must not fetch");
        },
      },
    );
    expect(requests).toBe(0);
    expect(report.results[0]?.policyStatus).toBe("pending");
  });
  it("records complete policy-skipped runs as fresh audits, without claiming healthy observations", async () => {
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
    const report = await buildPrioritySourceHealthReport(db);
    expect(report.completedAt).not.toBeNull();
    expect(report.window).toEqual({
      status: "incomplete",
      completedSpacedRuns: 1,
      requiredRuns: 3,
      minimumSpacingHours: 6,
    });
    expect(report.newlyShadow).toBe(0);
    expect(report.results.every((row) => row.status === "skipped")).toBe(true);
    expect(report.results.every((row) => row.evidenceWindow.qualifyingChecks === 0)).toBe(true);
    const completed = Date.parse(report.completedAt ?? "");
    expect(priorityReportFreshness(report, new Date(completed + 24 * 3_600_000))).toBe("fresh");
    expect(priorityReportFreshness(report, new Date(completed + 24 * 3_600_000 + 1))).toBe("stale");
    expect(priorityReportFreshness(report, new Date(completed - 1))).toBe("invalid");
    expect(
      priorityReportFreshness({ ...report, window: { ...report.window, status: "complete" } }),
    ).toBe("invalid");
    expect(
      priorityReportFreshness({
        ...report,
        results: report.results.map((row, index) =>
          index === 0 ? { ...row, finishedAt: "2099-01-01T00:00:00.000Z" } : row,
        ),
      }),
    ).toBe("invalid");
    const job = await db
      .selectFrom("jobs")
      .select("id")
      .where("type", "=", "source-audit")
      .executeTakeFirstOrThrow();
    await db.updateTable("jobs").set({ details_json: "{}" }).where("id", "=", job.id).execute();
    await expect(buildPrioritySourceHealthReport(db)).rejects.toThrow("targets");
  });
  it("records pending policy without sending a request or changing source state", async () => {
    const { db, config } = await setup();
    const source = await db
      .selectFrom("sources")
      .selectAll()
      .where("slug", "=", "samr-standards")
      .executeTakeFirstOrThrow();
    let requests = 0;
    const report = await auditSources(
      db,
      config,
      { sourceIds: [source.id], policies: { [source.id]: "pending" } },
      {
        fetcher: async () => {
          requests++;
          throw new Error("Private request sentinel");
        },
      },
    );
    expect(requests).toBe(0);
    expect(report.results).toMatchObject([
      { status: "skipped", policyStatus: "pending", itemCount: 0 },
    ]);
    expect(
      await db.selectFrom("sources").selectAll().where("id", "=", source.id).executeTakeFirst(),
    ).toEqual(source);
  });

  it("requires exact cohort membership and strips private audit metadata", async () => {
    const { db } = await setup();
    const report = await buildPrioritySourceHealthReport(db);
    expect(report.results).toHaveLength(12);
    expect(report.results.map((row) => row.slug)).toContain("samr-standards");
    expect(report.results.find((row) => row.slug === "robocasa")?.lifecycle).toBe("shadow");
    expect(report.completedAt).toBeNull();
    expect(report.results.every((row) => row.status === "not_checked")).toBe(true);
    const serialized = JSON.stringify(report);
    for (const key of [
      "sourceId",
      "jobId",
      "checkIds",
      "sample",
      "raw",
      "config",
      "targetSourceIds",
    ])
      expect(serialized).not.toContain(`"${key}"`);
    expect(() => validatePrioritySourceHealthReport({ ...report, jobId: "private" })).toThrow();
    expect(() =>
      validatePrioritySourceHealthReport({ ...report, results: report.results.slice(1) }),
    ).toThrow();
  });
});
