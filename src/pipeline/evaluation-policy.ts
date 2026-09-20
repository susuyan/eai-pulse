import { createHash } from "node:crypto";
import type { EmbodiedDataQuality, EmbodiedQualityReasonCode } from "./embodied-data-quality.js";
import { parseEvaluationInstant } from "./evaluation-context.js";

export const OPERATIONAL_POLICY_VERSION = 1;
export const PUBLIC_READINESS_POLICY_VERSION = 1;
export const QUALITY_FLOOR = 60;
export const EVALUATION_CRITICAL_AGE_MS = 24 * 60 * 60 * 1_000;
export const EVALUATION_PERSISTENT_AGE_MS = 72 * 60 * 60 * 1_000;

export const operationalEvaluationReasonCodes = [
  "system_score_below_floor",
  "evaluation_stale",
  "evaluation_persistently_stale",
  "evaluation_report_invalid",
] as const;
export type OperationalEvaluationReasonCode = (typeof operationalEvaluationReasonCodes)[number];

export const publicReadinessReasonCodes = [
  "evaluation_stale",
  "evaluation_persistently_stale",
  "evaluation_report_invalid",
  "missing_stage_coverage",
  "insufficient_tier1_evidence",
  "incomplete_data_profile",
  "unsupported_peer_claim",
  "generic_ai_leak",
] as const;
export type PublicReadinessReasonCode = (typeof publicReadinessReasonCodes)[number];

export interface OperationalEvaluationDecision {
  status: "ok" | "critical";
  reasonCodes: OperationalEvaluationReasonCode[];
  currentScore: number | null;
  persistedEvaluationAsOf: string | null;
  ageMinutes: number | null;
  refreshEligible: boolean;
  fingerprint: string;
}

export interface OperationalEvaluationInput {
  currentScore: number | null;
  persistedEvaluationAsOf: string | null;
  reportValid: boolean;
  now: Date;
}

export interface PublicReadinessDecision {
  status: "ok" | "critical";
  reasonCodes: PublicReadinessReasonCode[];
  fingerprint: string;
}

export interface PublicReadinessInput {
  operationalDecision: OperationalEvaluationDecision;
  embodiedQuality: EmbodiedDataQuality | null;
}

export interface VersionedFreshnessInput {
  evaluationAsOf: string;
  fileMtime: string;
  now: Date;
  currentScore?: number;
}

export interface VersionedFreshnessResult {
  status: "ok" | "critical";
  message: string;
  detail: {
    evaluationAsOf: string;
    fileMtime: string;
    ageMinutes: number | null;
    reasonCode: OperationalEvaluationReasonCode | null;
    reasonCodes: OperationalEvaluationReasonCode[];
    fingerprint: string;
    refreshEligible: boolean;
  };
}

export function decideOperationalEvaluation(
  input: OperationalEvaluationInput,
): OperationalEvaluationDecision {
  const currentScore = input.currentScore;
  let evaluationTime = Number.NaN;
  try {
    evaluationTime = parseEvaluationInstant(
      input.persistedEvaluationAsOf ?? "",
      "evaluationAsOf",
    ).getTime();
  } catch {
    // Invalid watermarks cannot authorize recovery.
  }
  if (
    !input.reportValid ||
    currentScore === null ||
    !Number.isFinite(currentScore) ||
    !Number.isFinite(evaluationTime) ||
    evaluationTime > input.now.getTime()
  ) {
    const reasonCodes: OperationalEvaluationReasonCode[] = ["evaluation_report_invalid"];
    return {
      status: "critical",
      reasonCodes,
      currentScore,
      persistedEvaluationAsOf: input.persistedEvaluationAsOf,
      ageMinutes: null,
      refreshEligible: false,
      fingerprint: operationalFingerprint(reasonCodes),
    };
  }

  const ageMs = Math.max(0, input.now.getTime() - evaluationTime);
  const reasonCodes: OperationalEvaluationReasonCode[] = [];
  if (currentScore < QUALITY_FLOOR) reasonCodes.push("system_score_below_floor");
  if (ageMs >= EVALUATION_PERSISTENT_AGE_MS) {
    reasonCodes.push("evaluation_persistently_stale");
  } else if (ageMs >= EVALUATION_CRITICAL_AGE_MS) {
    reasonCodes.push("evaluation_stale");
  }

  return {
    status: reasonCodes.length > 0 ? "critical" : "ok",
    reasonCodes,
    currentScore,
    persistedEvaluationAsOf: new Date(evaluationTime).toISOString(),
    ageMinutes: Math.round(ageMs / 60_000),
    refreshEligible: reasonCodes.length > 0,
    fingerprint: operationalFingerprint(reasonCodes),
  };
}

export function operationalFingerprint(reasons: OperationalEvaluationReasonCode[]): string {
  const normalized = [...new Set(reasons)].sort().join("|") || "ok";
  return createHash("sha256")
    .update(`evaluation-policy:v${OPERATIONAL_POLICY_VERSION}|${normalized}`)
    .digest("hex")
    .slice(0, 16);
}

export function decidePublicReadiness(input: PublicReadinessInput): PublicReadinessDecision {
  const operationalBlockers = input.operationalDecision.reasonCodes.filter(
    (reason): reason is Exclude<OperationalEvaluationReasonCode, "system_score_below_floor"> =>
      reason !== "system_score_below_floor",
  );
  const qualityMetrics = input.embodiedQuality
    ? [
        input.embodiedQuality.stageCoverage,
        input.embodiedQuality.tier1EvidenceRatio,
        input.embodiedQuality.dataProfileCompleteness,
        input.embodiedQuality.peerClaimEvidenceRatio,
        input.embodiedQuality.genericAILeak,
      ]
    : [];
  const qualityBlockers: EmbodiedQualityReasonCode[] = input.embodiedQuality
    ? [
        ...input.embodiedQuality.reasonCodes,
        ...qualityMetrics.flatMap((metric) => metric.reasonCodes),
      ]
    : [];
  if (
    input.embodiedQuality &&
    input.embodiedQuality.genericAILeak.numerator > 0 &&
    !qualityBlockers.includes("generic_ai_leak")
  ) {
    qualityBlockers.push("generic_ai_leak");
  }
  if (!input.embodiedQuality) operationalBlockers.push("evaluation_report_invalid");
  const reasonCodes = [...new Set([...operationalBlockers, ...qualityBlockers])].filter(
    (reason): reason is PublicReadinessReasonCode =>
      publicReadinessReasonCodes.includes(reason as PublicReadinessReasonCode),
  );
  if (
    input.embodiedQuality &&
    (!input.embodiedQuality.passed || qualityMetrics.some((metric) => metric.status === "fail")) &&
    reasonCodes.length === 0
  ) {
    reasonCodes.push("evaluation_report_invalid");
  }
  return {
    status: reasonCodes.length === 0 ? "ok" : "critical",
    reasonCodes,
    fingerprint: publicReadinessFingerprint(reasonCodes),
  };
}

export function publicReadinessFingerprint(reasons: PublicReadinessReasonCode[]): string {
  const normalized = [...new Set(reasons)].sort().join("|") || "ok";
  return createHash("sha256")
    .update(`public-readiness-policy:v${PUBLIC_READINESS_POLICY_VERSION}|${normalized}`)
    .digest("hex")
    .slice(0, 16);
}

export function evaluateVersionedFreshness(
  input: VersionedFreshnessInput,
): VersionedFreshnessResult {
  const decision = decideOperationalEvaluation({
    currentScore: input.currentScore ?? QUALITY_FLOOR,
    persistedEvaluationAsOf: input.evaluationAsOf,
    reportValid: true,
    now: input.now,
  });
  const reasonCode =
    decision.reasonCodes.find((reason) => reason !== "system_score_below_floor") ??
    decision.reasonCodes[0] ??
    null;
  return {
    status: decision.status,
    message:
      decision.status === "ok"
        ? `Evaluation watermark is ${decision.ageMinutes} minutes old`
        : `Evaluation watermark is ${decision.ageMinutes ?? "unknown"} minutes old — ${decision.reasonCodes.join(", ")}`,
    detail: {
      evaluationAsOf: decision.persistedEvaluationAsOf ?? input.evaluationAsOf,
      fileMtime: input.fileMtime,
      ageMinutes: decision.ageMinutes,
      reasonCode,
      reasonCodes: decision.reasonCodes,
      fingerprint: decision.fingerprint,
      refreshEligible: decision.refreshEligible,
    },
  };
}
