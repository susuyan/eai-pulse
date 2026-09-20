import { describe, expect, it } from "vitest";
import {
  decideOperationalEvaluation,
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
});
