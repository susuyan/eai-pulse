import { describe, expect, it } from "vitest";
import {
  ActorDataCapabilitySchema,
  CollectionMethodProfileSchema,
  DatasetProfileSchema,
  PeerCompanyProfileSchema,
  StandardProfileSchema,
} from "../src/domain/embodied-data-objects.js";
import actorCapabilities from "./fixtures/embodied-data/objects/actor-capabilities.json" with {
  type: "json",
};
import collectionMethods from "./fixtures/embodied-data/objects/collection-methods.json" with {
  type: "json",
};
import datasets from "./fixtures/embodied-data/objects/datasets.json" with { type: "json" };
import sourceManifest from "./fixtures/embodied-data/objects/source-manifest.json" with {
  type: "json",
};
import standards from "./fixtures/embodied-data/objects/standards.json" with { type: "json" };

describe("embodied data domain objects", () => {
  it("accepts three source-verified fixtures for each reusable object type", () => {
    expect(datasets).toHaveLength(3);
    expect(standards).toHaveLength(3);
    expect(collectionMethods).toHaveLength(3);

    for (const fixture of datasets)
      expect(DatasetProfileSchema.parse(fixture.profile)).toBeDefined();
    for (const fixture of standards)
      expect(StandardProfileSchema.parse(fixture.profile)).toBeDefined();
    for (const fixture of collectionMethods)
      expect(CollectionMethodProfileSchema.parse(fixture.profile)).toBeDefined();
  });

  it("keeps actor collection separate from sourced capability claims", () => {
    const capabilities = actorCapabilities.map((value) => ActorDataCapabilitySchema.parse(value));
    expect(new Set(capabilities.map((value) => value.verificationStatus))).toEqual(
      new Set(["self-claimed", "independently-verified", "conflicting", "unknown"]),
    );

    expect(
      PeerCompanyProfileSchema.parse({
        actorId: "fixture-actor",
        actorSlug: "fixture-company",
        actorName: "Fixture Company",
        contentScope: "embodied-data",
        capabilities,
      }),
    ).toBeDefined();
  });

  it("rejects unsafe URLs, unsupported enums, extra fields and unsourced metrics", () => {
    const dataset = datasets[0]?.profile;
    const standard = standards[0]?.profile;
    const method = collectionMethods[0]?.profile;
    expect(dataset).toBeDefined();
    expect(standard).toBeDefined();
    expect(method).toBeDefined();

    expect(
      DatasetProfileSchema.safeParse({ ...dataset, canonicalUrl: "http://example.com/dataset" })
        .success,
    ).toBe(false);
    expect(
      DatasetProfileSchema.safeParse({
        ...dataset,
        scaleClaims: [{ metric: "episodes", value: 1, unit: "episode" }],
      }).success,
    ).toBe(false);
    expect(
      StandardProfileSchema.safeParse({ ...standard, standardType: "marketing" }).success,
    ).toBe(false);
    expect(CollectionMethodProfileSchema.safeParse({ ...method, pipelineStages: [] }).success).toBe(
      false,
    );
    expect(DatasetProfileSchema.safeParse({ ...dataset, unexpected: true }).success).toBe(false);
  });

  it("covers every real fixture with an HTTPS primary-source manifest", () => {
    const expected = new Set([
      ...datasets.map((item) => `dataset:${item.slug}`),
      ...standards.map((item) => `standard:${item.slug}`),
      ...collectionMethods.map((item) => `collection-method:${item.slug}`),
    ]);
    const covered = new Set(sourceManifest.map((item) => `${item.objectType}:${item.objectSlug}`));

    expect(covered).toEqual(expected);
    for (const item of sourceManifest) {
      expect(new URL(item.url).protocol).toBe("https:");
      expect(new Date(item.verifiedAt).toISOString()).toBe(item.verifiedAt);
    }
  });
});
