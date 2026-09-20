import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkFreshness } from "../src/cli/monitor-check.js";
import { evaluateVersionedFreshness } from "../src/pipeline/evaluation-policy.js";
import { buildSystemEvaluationReport } from "../src/pipeline/evaluation-progress.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("versioned evaluation freshness", () => {
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
    expect(await checkFreshness(directory, now)).toMatchObject(
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
});
