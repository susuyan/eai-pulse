import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertEvaluationBaselineWriteIsSafe,
  resolveEvaluationInvocation,
} from "../../src/cli/evaluate.js";
import { normalizeSystemEvaluationReport } from "../../src/pipeline/evaluation-progress.js";

function legacyReport(finishedAt: string) {
  return {
    schemaVersion: 1,
    id: "evaluation",
    releaseVersion: "test",
    status: "partial",
    overallScore: 60,
    rawWeightedScore: 65,
    evidenceCoverage: 50,
    dimensions: [],
    capabilities: [],
    notes: "Measured evidence only.",
    startedAt: "2026-08-26T12:39:37.724Z",
    finishedAt,
    target: 80,
    targetReached: false,
    policy: "measured-evidence-only",
    improvementPlan: [],
  };
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("evaluation CLI invocation", () => {
  it("rejects a change report as the change-gate baseline", () => {
    const baseline = normalizeSystemEvaluationReport(legacyReport("2026-08-26T12:39:38.724Z"));
    expect(() =>
      resolveEvaluationInvocation(
        ["--gate=change", "--baseline=baseline.json"],
        { ...baseline, gateMode: "change" },
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).toThrow(/operational/);
  });

  it("emits an invalid decision without refresh authority for a persisted change report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "evaluation-mode-"));
    directories.push(directory);
    const baselinePath = join(directory, "baseline.json");
    const outputPath = join(directory, "result.json");
    const baseline = {
      ...normalizeSystemEvaluationReport(legacyReport("2026-08-26T12:39:38.724Z")),
      gateMode: "change",
    };
    const original = JSON.stringify(baseline);
    await writeFile(baselinePath, original);
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/evaluate.ts",
        "--skip-bootstrap",
        "--gate=operational",
        `--baseline=${baselinePath}`,
        `--output=${outputPath}`,
      ],
      {
        env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" },
        stdio: "pipe",
      },
    );
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      operationalDecision: {
        status: "critical",
        reasonCodes: ["evaluation_report_invalid"],
        refreshEligible: false,
      },
    });
    expect(await readFile(baselinePath, "utf8")).toBe(original);
  });

  it("inherits the normalized baseline time for change gate", () => {
    const baseline = legacyReport("2026-08-26T12:39:38.724Z");

    expect(
      resolveEvaluationInvocation(
        ["--gate=change", "--baseline=baseline.json", "--fail-on-regression"],
        normalizeSystemEvaluationReport(baseline),
        new Date("2026-09-20T00:00:00.000Z"),
      ),
    ).toMatchObject({
      gateMode: "change",
      asOf: new Date("2026-08-26T12:39:38.724Z"),
      persist: false,
    });
  });

  it("rejects change gate without a baseline", () => {
    expect(() =>
      resolveEvaluationInvocation(["--gate=change"], null, new Date("2026-09-20T00:00:00.000Z")),
    ).toThrow(/requires --baseline/);
  });

  it("rejects a conflicting change-gate time", () => {
    expect(() =>
      resolveEvaluationInvocation(
        ["--gate=change", "--baseline=baseline.json", "--as-of=2026-09-20T00:00:00.000Z"],
        normalizeSystemEvaluationReport(legacyReport("2026-08-26T12:39:38.724Z")),
        new Date("2026-09-20T00:00:00.000Z"),
      ),
    ).toThrow(/cannot override baseline evaluationAsOf/);
  });

  it("uses one captured run time for operational gate", () => {
    const runStartedAt = new Date("2026-09-20T00:00:00.000Z");

    expect(resolveEvaluationInvocation(["--gate=operational"], null, runStartedAt)).toEqual({
      gateMode: "operational",
      asOf: runStartedAt,
      persist: false,
      failOnRegression: false,
      legacyFlagUsed: false,
    });
  });

  it("does not overwrite an invalid operational baseline in place", async () => {
    const directory = await mkdtemp(join(tmpdir(), "evaluation-invalid-baseline-"));
    directories.push(directory);
    const baselinePath = join(directory, "baseline.json");
    const original = "{invalid";
    await writeFile(baselinePath, original);

    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/evaluate.ts",
          "--skip-bootstrap",
          "--gate=operational",
          "--persist",
          `--baseline=${baselinePath}`,
          `--output=${baselinePath}`,
        ],
        {
          env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" },
          stdio: "pipe",
        },
      ),
    ).toThrow();
    expect(await readFile(baselinePath, "utf8")).toBe(original);
  });

  it("rejects a future watermark before persistence", () => {
    const runStartedAt = new Date("2026-09-20T00:00:00.000Z");
    const baseline = normalizeSystemEvaluationReport(legacyReport("2026-09-21T00:00:00.000Z"));
    expect(() =>
      assertEvaluationBaselineWriteIsSafe({
        invocation: {
          gateMode: "operational",
          asOf: runStartedAt,
          persist: true,
          failOnRegression: false,
          legacyFlagUsed: false,
        },
        baselinePath: "baseline.json",
        outputPath: "baseline.json",
        baseline,
        baselineError: null,
        runStartedAt,
      }),
    ).toThrow(/watermark is invalid or future/);
  });

  it("does not let a change report overwrite its operational baseline", () => {
    const runStartedAt = new Date("2026-09-20T00:00:00.000Z");
    const baseline = normalizeSystemEvaluationReport(legacyReport("2026-08-26T12:39:38.724Z"));
    expect(() =>
      assertEvaluationBaselineWriteIsSafe({
        invocation: {
          gateMode: "change",
          asOf: new Date(baseline.evaluationAsOf),
          persist: false,
          failOnRegression: true,
          legacyFlagUsed: false,
        },
        baselinePath: "baseline.json",
        outputPath: "./baseline.json",
        baseline,
        baselineError: null,
        runStartedAt,
      }),
    ).toThrow(/cannot overwrite its operational baseline/);
  });
});
