import { EmbodiedPipelineStageSchema } from "../domain/embodied-data.js";

export type EmbodiedQualityReasonCode =
  | "missing_stage_coverage"
  | "insufficient_tier1_evidence"
  | "incomplete_data_profile"
  | "unsupported_peer_claim"
  | "generic_ai_leak";

export interface EmbodiedQualityMetric {
  numerator: number;
  denominator: number;
  score: number;
  status: "pass" | "fail";
  evidenceAgeHours: number | null;
  reasonCodes: EmbodiedQualityReasonCode[];
}

export interface EmbodiedQualityEvent {
  contentScope: string;
  stages: string[];
  tier1Evidence: boolean;
  completeProfile: boolean;
  evidenceAt: string | null;
}

export interface EmbodiedQualityPeerClaim {
  verificationStatus: string;
  claimant: string;
  evidenceRoles: string[];
  evidenceAt: string | null;
}

export interface EmbodiedDataQuality {
  stageCoverage: EmbodiedQualityMetric;
  tier1EvidenceRatio: EmbodiedQualityMetric;
  dataProfileCompleteness: EmbodiedQualityMetric;
  peerClaimEvidenceRatio: EmbodiedQualityMetric;
  genericAILeak: EmbodiedQualityMetric;
  passed: boolean;
  reasonCodes: EmbodiedQualityReasonCode[];
}

export function calculateEmbodiedDataQuality(input: {
  readyPublicEvents: EmbodiedQualityEvent[];
  peerClaims: EmbodiedQualityPeerClaim[];
  asOf: Date;
}): EmbodiedDataQuality {
  const expectedStages = EmbodiedPipelineStageSchema.options;
  const coveredStages = new Set(input.readyPublicEvents.flatMap((event) => event.stages));
  const stageCoverage = metric({
    numerator: expectedStages.filter((stage) => coveredStages.has(stage)).length,
    denominator: expectedStages.length,
    requiredRatio: 1,
    reason: "missing_stage_coverage",
    timestamps: input.readyPublicEvents.map((event) => event.evidenceAt),
    asOf: input.asOf,
  });
  const tier1EvidenceRatio = metric({
    numerator: input.readyPublicEvents.filter((event) => event.tier1Evidence).length,
    denominator: input.readyPublicEvents.length,
    requiredRatio: 0.8,
    reason: "insufficient_tier1_evidence",
    timestamps: input.readyPublicEvents.map((event) => event.evidenceAt),
    asOf: input.asOf,
  });
  const dataProfileCompleteness = metric({
    numerator: input.readyPublicEvents.filter((event) => event.completeProfile).length,
    denominator: input.readyPublicEvents.length,
    requiredRatio: 1,
    reason: "incomplete_data_profile",
    timestamps: input.readyPublicEvents.map((event) => event.evidenceAt),
    asOf: input.asOf,
  });
  const supportedClaims = input.peerClaims.filter((claim) => {
    if (claim.verificationStatus === "self-claimed") {
      return claim.claimant === "company" && claim.evidenceRoles.includes("claim");
    }
    if (claim.verificationStatus === "independently-verified") {
      return claim.claimant === "independent" && claim.evidenceRoles.includes("verification");
    }
    if (claim.verificationStatus === "conflicting") {
      return claim.claimant === "independent" && claim.evidenceRoles.includes("contradiction");
    }
    return false;
  });
  const peerClaimEvidenceRatio = metric({
    numerator: supportedClaims.length,
    denominator: input.peerClaims.length,
    requiredRatio: 1,
    reason: "unsupported_peer_claim",
    timestamps: input.peerClaims.map((claim) => claim.evidenceAt),
    asOf: input.asOf,
  });
  const leakCount = input.readyPublicEvents.filter(
    (event) => event.contentScope !== "embodied-data",
  ).length;
  const genericAILeak: EmbodiedQualityMetric = {
    numerator: leakCount,
    denominator: input.readyPublicEvents.length,
    score: leakCount === 0 ? 100 : 0,
    status: leakCount === 0 ? "pass" : "fail",
    evidenceAgeHours: evidenceAge(
      input.readyPublicEvents.map((event) => event.evidenceAt),
      input.asOf,
    ),
    reasonCodes: leakCount === 0 ? [] : ["generic_ai_leak"],
  };
  const metrics = [
    stageCoverage,
    tier1EvidenceRatio,
    dataProfileCompleteness,
    peerClaimEvidenceRatio,
    genericAILeak,
  ];
  const reasonCodes = [...new Set(metrics.flatMap((item) => item.reasonCodes))];
  return {
    stageCoverage,
    tier1EvidenceRatio,
    dataProfileCompleteness,
    peerClaimEvidenceRatio,
    genericAILeak,
    passed: reasonCodes.length === 0,
    reasonCodes,
  };
}

function metric(input: {
  numerator: number;
  denominator: number;
  requiredRatio: number;
  reason: EmbodiedQualityReasonCode;
  timestamps: Array<string | null>;
  asOf: Date;
}): EmbodiedQualityMetric {
  const ratio = input.denominator === 0 ? 0 : input.numerator / input.denominator;
  const status = ratio >= input.requiredRatio ? "pass" : "fail";
  return {
    numerator: input.numerator,
    denominator: input.denominator,
    score: Math.round(ratio * 100),
    status,
    evidenceAgeHours: evidenceAge(input.timestamps, input.asOf),
    reasonCodes: status === "pass" ? [] : [input.reason],
  };
}

function evidenceAge(timestamps: Array<string | null>, asOf: Date): number | null {
  const values = timestamps
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value <= asOf.getTime());
  if (values.length === 0) return null;
  return Math.round(((asOf.getTime() - Math.max(...values)) / 3_600_000) * 100) / 100;
}
