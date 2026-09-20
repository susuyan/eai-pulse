import { describe, expect, it } from "vitest";
import type { EmbodiedDataQuality } from "../src/pipeline/embodied-data-quality.js";
import type { EvaluationDimension } from "../src/pipeline/evaluate.js";
import { parseEvaluationInstant } from "../src/pipeline/evaluation-context.js";
import {
  buildSystemEvaluationReport,
  compareSystemEvaluations,
  normalizeSystemEvaluationReport,
} from "../src/pipeline/evaluation-progress.js";

function dimension(overrides: Partial<EvaluationDimension> = {}): EvaluationDimension {
  return {
    slug: "coverage",
    name: "Coverage",
    score: 60,
    rawScore: 60,
    scoreCap: 100,
    weight: 20,
    status: "measured",
    sampleSize: 100,
    sampleTarget: 100,
    summary: "Measured coverage.",
    evidence: {},
    penalties: [],
    nextAction: "Collect more qualified evidence.",
    ...overrides,
  };
}

function evaluation(dimensions: EvaluationDimension[]) {
  return {
    id: "evaluation",
    releaseVersion: "test",
    status: "partial",
    overallScore: 60,
    rawWeightedScore: 65,
    evidenceCoverage: 50,
    dimensions,
    capabilities: [],
    notes: "Measured evidence only.",
    startedAt: "2026-07-14T00:00:00.000Z",
    finishedAt: "2026-07-14T00:00:01.000Z",
  };
}

function buildLegacyReport() {
  return {
    schemaVersion: 1,
    ...evaluation([dimension()]),
    target: 80,
    targetReached: false,
    policy: "measured-evidence-only" as const,
    improvementPlan: [
      {
        slug: "coverage",
        name: "Coverage",
        score: 60,
        status: "measured" as const,
        weightedGap: 20,
        penalties: [],
        nextAction: "Collect more qualified evidence.",
      },
    ],
  };
}

function reportV2(evaluationAsOf: string, gateMode: "change" | "operational") {
  return {
    ...buildLegacyReport(),
    schemaVersion: 2 as const,
    evaluationAsOf,
    gateMode,
  };
}

function embodiedQuality(leaks = 0): EmbodiedDataQuality {
  const passing = {
    numerator: 1,
    denominator: 1,
    score: 100,
    status: "pass" as const,
    evidenceAgeHours: 1,
    reasonCodes: [],
  };
  return {
    stageCoverage: passing,
    tier1EvidenceRatio: passing,
    dataProfileCompleteness: passing,
    peerClaimEvidenceRatio: passing,
    genericAILeak: {
      numerator: leaks,
      denominator: 1,
      score: leaks === 0 ? 100 : 0,
      status: leaks === 0 ? ("pass" as const) : ("fail" as const),
      evidenceAgeHours: 1,
      reasonCodes: leaks === 0 ? [] : ["generic_ai_leak"],
    },
    passed: leaks === 0,
    reasonCodes: leaks === 0 ? [] : ["generic_ai_leak"],
  };
}

describe("system evaluation progress", () => {
  it.each([
    "2026-02-30T12:00:00.000Z",
    "2026-02-29T12:00:00.000Z",
    "2026-04-31T12:00:00+08:00",
    "2026-08-26T12:00:00",
    "2026-08-26",
    "12",
    "August 26, 2026 12:00:00 GMT",
    "2026-08-26T24:00:00Z",
  ])("rejects ambiguous or invalid context and report timestamps: %s", (timestamp) => {
    expect(() => parseEvaluationInstant(timestamp, "asOf")).toThrow(/Invalid asOf/);
    expect(() =>
      normalizeSystemEvaluationReport({
        ...buildLegacyReport(),
        finishedAt: timestamp,
      }),
    ).toThrow(/finishedAt/);
    for (const field of ["startedAt", "finishedAt", "evaluationAsOf"]) {
      expect(() =>
        normalizeSystemEvaluationReport({
          ...reportV2("2026-08-26T12:00:00Z", "operational"),
          [field]: timestamp,
        }),
      ).toThrow(new RegExp(field));
    }
  });

  it("accepts leap-day and explicit-offset instants in both report modes", () => {
    expect(parseEvaluationInstant("2024-02-29T20:00:00+08:00", "asOf").toISOString()).toBe(
      "2024-02-29T12:00:00.000Z",
    );
    expect(
      normalizeSystemEvaluationReport(reportV2("2026-08-26T20:00:00+08:00", "change")),
    ).toMatchObject({ evaluationAsOf: "2026-08-26T12:00:00.000Z", gateMode: "change" });
  });

  it("ranks the largest weighted evidence gap first", () => {
    const report = buildSystemEvaluationReport(
      evaluation([
        dimension({ slug: "small", name: "Small", score: 70, weight: 10 }),
        dimension({ slug: "large", name: "Large", score: 40, weight: 30 }),
      ]),
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "operational", persist: false },
    );

    expect(report).toMatchObject({
      schemaVersion: 2,
      evaluationAsOf: "2026-07-14T00:00:01.000Z",
      gateMode: "operational",
      target: 80,
      targetReached: false,
      policy: "measured-evidence-only",
    });
    expect(report.improvementPlan.map((item) => item.slug)).toEqual(["large", "small"]);
  });

  it("fails when aggregate evidence or any existing dimension regresses", () => {
    const baseline = buildSystemEvaluationReport(
      evaluation([dimension({ slug: "coverage", score: 60 })]),
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "operational", persist: false },
    );
    const current = buildSystemEvaluationReport(
      {
        ...evaluation([dimension({ slug: "coverage", score: 59 })]),
        overallScore: 59,
        rawWeightedScore: 64,
        evidenceCoverage: 49,
      },
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "change", persist: false },
    );

    expect(compareSystemEvaluations(current, baseline)).toMatchObject({
      passed: false,
      scoreDelta: -1,
      evidenceCoverageDelta: -1,
      regressions: [
        "overall score regressed from 60 to 59",
        "raw weighted score regressed from 65 to 64",
        "evidence coverage regressed from 50% to 49%",
        "dimension coverage regressed from 60 to 59",
      ],
    });
  });

  it("passes stable scores and allows a newly measured dimension", () => {
    const baseline = buildSystemEvaluationReport(
      evaluation([dimension({ slug: "coverage", score: 60 })]),
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "operational", persist: false },
    );
    const current = buildSystemEvaluationReport(
      evaluation([
        dimension({ slug: "coverage", score: 60 }),
        dimension({ slug: "new-evidence", score: 30, status: "insufficient_data" }),
      ]),
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "change", persist: false },
    );

    expect(compareSystemEvaluations(current, baseline)).toMatchObject({
      passed: true,
      scoreDelta: 0,
      regressions: [],
    });
  });

  it("fails the comparison absolutely when one generic AI item leaks", () => {
    const baseline = buildSystemEvaluationReport(
      { ...evaluation([dimension()]), embodiedQuality: embodiedQuality(0) },
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "operational", persist: false },
    );
    const current = buildSystemEvaluationReport(
      { ...evaluation([dimension({ score: 100 })]), embodiedQuality: embodiedQuality(1) },
      { asOf: new Date("2026-07-14T00:00:01.000Z"), gateMode: "change", persist: false },
    );

    expect(compareSystemEvaluations(current, baseline)).toMatchObject({
      passed: false,
      regressions: expect.arrayContaining(["generic_ai_leak"]),
    });
  });

  it("normalizes a v1 report to the same UTC evaluation instant", () => {
    const v1 = {
      ...buildLegacyReport(),
      finishedAt: "2026-08-26T20:39:38.724+08:00",
    };

    expect(normalizeSystemEvaluationReport(v1)).toMatchObject({
      schemaVersion: 2,
      evaluationAsOf: "2026-08-26T12:39:38.724Z",
      gateMode: "operational",
    });
  });

  it("rejects a v1 report without a valid finishedAt", () => {
    expect(() =>
      normalizeSystemEvaluationReport({
        ...buildLegacyReport(),
        finishedAt: "not-a-time",
      }),
    ).toThrow(/finishedAt/);
  });

  it("fails comparison when reference times differ", () => {
    const baseline = reportV2("2026-08-26T12:39:38.724Z", "operational");
    const current = reportV2("2026-09-20T00:00:00.000Z", "change");

    expect(compareSystemEvaluations(current, baseline)).toMatchObject({
      passed: false,
      contextError: "evaluation_context_mismatch",
      regressions: [
        "evaluation context mismatch: baseline 2026-08-26T12:39:38.724Z, current 2026-09-20T00:00:00.000Z",
      ],
    });
  });

  it("round-trips a v2 operational decision", () => {
    const report = {
      ...reportV2("2026-09-20T00:00:00.000Z", "operational"),
      operationalDecision: {
        status: "critical",
        reasonCodes: ["evaluation_stale"],
        currentScore: 60,
        persistedEvaluationAsOf: "2026-09-19T00:00:00.000Z",
        ageMinutes: 1_440,
        refreshEligible: true,
        fingerprint: "0123456789abcdef",
      },
    };

    expect(normalizeSystemEvaluationReport(report)).toMatchObject({
      schemaVersion: 2,
      operationalDecision: report.operationalDecision,
    });
  });
});
