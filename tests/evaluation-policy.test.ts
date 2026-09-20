import { describe, expect, it } from "vitest";
import type {
  EmbodiedDataQuality,
  EmbodiedQualityMetric,
} from "../src/pipeline/embodied-data-quality.js";
import {
  decideOperationalEvaluation,
  decidePublicReadiness,
  operationalFingerprint,
} from "../src/pipeline/evaluation-policy.js";

const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("operational evaluation policy", () => {
  it.each([
    [60, "2026-09-20T00:00:01.000Z", "ok", []],
    [59, "2026-09-20T00:00:01.000Z", "critical", ["system_score_below_floor"]],
    [60, "2026-09-19T12:00:00.000Z", "critical", ["evaluation_stale"]],
    [60, "2026-09-17T12:00:00.000Z", "critical", ["evaluation_persistently_stale"]],
  ] as const)("applies absolute score and age policy", (score, asOf, status, reasonCodes) => {
    expect(
      decideOperationalEvaluation({
        currentScore: score,
        persistedEvaluationAsOf: asOf,
        reportValid: true,
        now: NOW,
      }),
    ).toMatchObject({ status, reasonCodes });
  });

  it("does not authorize refresh for an invalid persisted report", () => {
    expect(
      decideOperationalEvaluation({
        currentScore: null,
        persistedEvaluationAsOf: null,
        reportValid: false,
        now: NOW,
      }),
    ).toMatchObject({
      status: "critical",
      reasonCodes: ["evaluation_report_invalid"],
      refreshEligible: false,
    });
  });

  it("rejects a future persisted watermark", () => {
    expect(
      decideOperationalEvaluation({
        currentScore: 60,
        persistedEvaluationAsOf: "2026-09-20T12:00:01.000Z",
        reportValid: true,
        now: NOW,
      }),
    ).toMatchObject({
      status: "critical",
      reasonCodes: ["evaluation_report_invalid"],
      refreshEligible: false,
    });
  });

  it("keeps the fingerprint stable when reason order changes", () => {
    const left = operationalFingerprint(["evaluation_stale", "system_score_below_floor"]);
    const right = operationalFingerprint(["system_score_below_floor", "evaluation_stale"]);
    expect(left).toBe(right);
  });

  it("keeps a low maturity score visible without blocking a ready embodied public site", () => {
    const operationalDecision = decideOperationalEvaluation({
      currentScore: 39,
      persistedEvaluationAsOf: "2026-09-20T00:00:01.000Z",
      reportValid: true,
      now: NOW,
    });

    expect(
      decidePublicReadiness({
        operationalDecision,
        embodiedQuality: passingEmbodiedQuality(),
      }),
    ).toMatchObject({ status: "ok", reasonCodes: [] });
    expect(operationalDecision).toMatchObject({
      status: "critical",
      reasonCodes: ["system_score_below_floor"],
    });
  });

  it("fails public readiness for embodied quality regressions", () => {
    const embodiedQuality = passingEmbodiedQuality();
    embodiedQuality.passed = false;
    embodiedQuality.reasonCodes = ["unsupported_peer_claim"];
    embodiedQuality.peerClaimEvidenceRatio = {
      ...embodiedQuality.peerClaimEvidenceRatio,
      status: "fail",
      reasonCodes: ["unsupported_peer_claim"],
    };

    expect(
      decidePublicReadiness({
        operationalDecision: decideOperationalEvaluation({
          currentScore: 80,
          persistedEvaluationAsOf: "2026-09-20T00:00:01.000Z",
          reportValid: true,
          now: NOW,
        }),
        embodiedQuality,
      }),
    ).toMatchObject({
      status: "critical",
      reasonCodes: ["unsupported_peer_claim"],
    });
  });

  it("fails closed when an embodied metric contradicts the aggregate result", () => {
    const embodiedQuality = passingEmbodiedQuality();
    embodiedQuality.stageCoverage.status = "fail";

    expect(
      decidePublicReadiness({
        operationalDecision: decideOperationalEvaluation({
          currentScore: 80,
          persistedEvaluationAsOf: "2026-09-20T00:00:01.000Z",
          reportValid: true,
          now: NOW,
        }),
        embodiedQuality,
      }),
    ).toMatchObject({
      status: "critical",
      reasonCodes: ["evaluation_report_invalid"],
    });
  });

  it.each([
    "evaluation_report_invalid",
    "evaluation_stale",
  ] as const)("keeps %s as a hard public blocker", (reasonCode) => {
    expect(
      decidePublicReadiness({
        operationalDecision: {
          status: "critical",
          reasonCodes: [reasonCode],
          currentScore: 80,
          persistedEvaluationAsOf: null,
          ageMinutes: null,
          refreshEligible: reasonCode !== "evaluation_report_invalid",
          fingerprint: "maturity",
        },
        embodiedQuality: passingEmbodiedQuality(),
      }),
    ).toMatchObject({ status: "critical", reasonCodes: [reasonCode] });
  });
});

function passingEmbodiedQuality(): EmbodiedDataQuality {
  const metric: EmbodiedQualityMetric = {
    numerator: 1,
    denominator: 1,
    score: 100,
    status: "pass" as const,
    evidenceAgeHours: 0,
    reasonCodes: [],
  };
  return {
    stageCoverage: { ...metric },
    tier1EvidenceRatio: { ...metric },
    dataProfileCompleteness: { ...metric },
    peerClaimEvidenceRatio: { ...metric },
    genericAILeak: { ...metric, numerator: 0 },
    passed: true,
    reasonCodes: [],
  };
}
