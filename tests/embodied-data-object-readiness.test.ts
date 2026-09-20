import { describe, expect, it } from "vitest";
import { evaluateDomainObjectReadiness } from "../src/pipeline/embodied-data-object-readiness.js";
import capabilities from "./fixtures/embodied-data/objects/actor-capabilities.json" with {
  type: "json",
};
import collectionMethods from "./fixtures/embodied-data/objects/collection-methods.json" with {
  type: "json",
};
import datasets from "./fixtures/embodied-data/objects/datasets.json" with { type: "json" };
import standards from "./fixtures/embodied-data/objects/standards.json" with { type: "json" };

const relation = [{ eventId: "event-1", role: "release" }];
const primaryEvidence = [
  {
    eventId: "event-1",
    sourceUrl: "https://example.com/original",
    sourceTier: 1,
    sourceRole: "publisher" as const,
    verifiedAt: "2026-09-20T00:00:00.000Z",
  },
];

describe("embodied data object readiness", () => {
  it("accepts valid linked datasets, standards, and collection methods", () => {
    expect(
      evaluateDomainObjectReadiness(
        { kind: "dataset", profile: datasets[0]?.profile },
        relation,
        primaryEvidence,
      ),
    ).toMatchObject({ status: "ready", blockers: [] });
    expect(
      evaluateDomainObjectReadiness(
        { kind: "standard", profile: standards[0]?.profile },
        relation,
        primaryEvidence,
      ),
    ).toMatchObject({ status: "ready", blockers: [] });
    expect(
      evaluateDomainObjectReadiness(
        { kind: "collection-method", profile: collectionMethods[0]?.profile },
        relation,
        primaryEvidence,
      ),
    ).toMatchObject({ status: "ready", blockers: [] });
  });

  it("blocks missing time boundaries, unsafe URLs, and unsourced numeric claims", () => {
    const dataset = datasets[0]?.profile;
    if (!dataset) throw new Error("Missing dataset fixture");

    expect(
      evaluateDomainObjectReadiness(
        { kind: "dataset", profile: { ...dataset, version: null, releaseDate: null } },
        relation,
        primaryEvidence.map(({ verifiedAt: _verifiedAt, ...item }) => item),
      ).blockers,
    ).toContain("missing_time_or_version");
    expect(
      evaluateDomainObjectReadiness(
        { kind: "dataset", profile: { ...dataset, canonicalUrl: "http://example.com/data" } },
        relation,
        primaryEvidence,
      ).blockers,
    ).toContain("unsafe_evidence_url");
    expect(
      evaluateDomainObjectReadiness(
        {
          kind: "dataset",
          profile: {
            ...dataset,
            scaleClaims: [{ metric: "episodes", value: 10, unit: "episode" }],
          },
        },
        relation,
        primaryEvidence,
      ).blockers,
    ).toContain("unsourced_numeric_claim");
  });

  it("requires a canonical relation and matching evidence", () => {
    expect(
      evaluateDomainObjectReadiness(
        { kind: "standard", profile: standards[0]?.profile },
        [],
        primaryEvidence,
      ).blockers,
    ).toContain("missing_relation_evidence");
    expect(
      evaluateDomainObjectReadiness(
        { kind: "collection-method", profile: collectionMethods[0]?.profile },
        relation,
        [],
      ).blockers,
    ).toContain("missing_primary_evidence");
  });

  it("does not infer independent verification from actor existence", () => {
    const capability = capabilities.find(
      (item) => item.verificationStatus === "independently-verified",
    );
    if (!capability) throw new Error("Missing capability fixture");

    const result = evaluateDomainObjectReadiness(
      {
        kind: "actor-capability",
        profile: { ...capability, claimant: "company" },
      },
      [{ eventId: "event-1", role: "claim" }],
      primaryEvidence,
    );

    expect(result.blockers).toEqual(
      expect.arrayContaining(["false_independent_verification", "missing_relation_evidence"]),
    );
  });
});
