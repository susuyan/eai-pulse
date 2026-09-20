import { describe, expect, it } from "vitest";
import { resolveEvaluationInvocation } from "../../src/cli/evaluate.js";
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

describe("evaluation CLI invocation", () => {
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
});
