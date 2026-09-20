import { describe, expect, it } from "vitest";
import { calculateEmbodiedDataQuality } from "../src/pipeline/embodied-data-quality.js";

const AS_OF = new Date("2026-09-20T00:00:00.000Z");
const stages = [
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
];

function event(stage: string, contentScope = "embodied-data") {
  return {
    contentScope,
    stages: [stage],
    tier1Evidence: true,
    completeProfile: true,
    evidenceAt: "2026-09-19T00:00:00.000Z",
  };
}

describe("embodied data quality", () => {
  it("measures six-stage coverage from ready public events", () => {
    const quality = calculateEmbodiedDataQuality({
      readyPublicEvents: stages.map((stage) => event(stage)),
      peerClaims: [],
      asOf: AS_OF,
    });
    expect(quality.stageCoverage).toMatchObject({
      numerator: 6,
      denominator: 6,
      score: 100,
      status: "pass",
    });
    expect(quality.tier1EvidenceRatio.status).toBe("pass");
    expect(quality.dataProfileCompleteness.status).toBe("pass");
  });

  it("does not treat a company claim as independent verification", () => {
    const quality = calculateEmbodiedDataQuality({
      readyPublicEvents: stages.map((stage) => event(stage)),
      peerClaims: [
        {
          verificationStatus: "independently-verified",
          claimant: "company",
          evidenceRoles: ["claim"],
          evidenceAt: "2026-09-19T00:00:00.000Z",
        },
      ],
      asOf: AS_OF,
    });
    expect(quality.peerClaimEvidenceRatio).toMatchObject({
      numerator: 0,
      denominator: 1,
      status: "fail",
      reasonCodes: ["unsupported_peer_claim"],
    });
  });

  it("fails absolutely on one generic AI leak despite perfect weighted metrics", () => {
    const quality = calculateEmbodiedDataQuality({
      readyPublicEvents: [
        ...stages.map((stage) => event(stage)),
        event("demand-definition", "legacy-ai"),
      ],
      peerClaims: [],
      asOf: AS_OF,
    });
    expect(quality.stageCoverage.score).toBe(100);
    expect(quality.tier1EvidenceRatio.score).toBe(100);
    expect(quality.dataProfileCompleteness.score).toBe(100);
    expect(quality.genericAILeak).toMatchObject({
      numerator: 1,
      status: "fail",
      reasonCodes: ["generic_ai_leak"],
    });
    expect(quality.passed).toBe(false);
  });
});
