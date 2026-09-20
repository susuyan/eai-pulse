import { describe, expect, it } from "vitest";
import type { DomainObjectRecord } from "../src/db/repository.js";
import type { DatasetProfile, PeerCompanyProfile } from "../src/domain/embodied-data-objects.js";
import type { PublicEvent } from "../src/domain/types.js";
import {
  projectPublicDataset,
  projectPublicEmbodiedEvent,
  projectPublicPeer,
} from "../src/pipeline/static-site/embodied-intelligence.js";

const profile = {
  pipelineStages: ["acquisition-route"],
  scenarios: ["tabletop manipulation"],
  embodiments: ["single-arm"],
  tasks: ["manipulation"],
  modalities: ["rgb", "action"],
  acquisitionMethods: ["teleoperation"],
  dataFormats: ["RLDS"],
  standards: ["RLDS"],
  scaleClaims: [
    {
      metric: "episodes",
      value: 100,
      unit: "episodes",
      sourceUrl: "https://example.com/evidence",
    },
  ],
  qualityMetrics: ["task completion"],
  costSignals: ["operator time"],
  deliveryImpact: "Defines the acquisition and acceptance boundary for the production run.",
  evidenceStatus: "verified",
} as const;

const event: PublicEvent = {
  id: "private-event-id",
  slug: "embodied-event",
  title: "Embodied event",
  factSummary: "A verified embodied data production change.",
  summary: "Summary",
  technicalInsight: "Technical insight",
  industryInsight: "Industry insight",
  futureOutlook: "Next signal",
  businessValue: "Business impact",
  category: "embodied-data",
  company: "Example Lab",
  keywords: ["teleoperation"],
  confidenceScore: 90,
  heatScore: 70,
  impactScore: 80,
  valueScore: 75,
  scoreFactors: {
    authority: 1,
    corroboration: 1,
    primaryEvidence: 1,
    uniqueAuthors: 1,
    independentSources: 1,
    platformBreadth: 1,
    regionBreadth: 1,
    velocity: 1,
    freshness: 1,
    crossRegion: false,
  },
  featured: true,
  happenedAt: "2026-09-20T00:00:00.000Z",
  publishedAt: "2026-09-20T00:00:00.000Z",
  evidence: [
    {
      title: "Primary evidence",
      url: "https://example.com/evidence",
      source: "Example Lab",
      role: "primary",
      publishedAt: "2026-09-20T00:00:00.000Z",
    },
  ],
};

describe("embodied public DTOs", () => {
  it("projects a strict event profile without internal identifiers", () => {
    const projected = projectPublicEmbodiedEvent(event, profile, {
      tracks: [
        {
          slug: "acquisition-route",
          name: "采集技术路线",
          color: "#f09a3e",
          icon: "02",
          role: "primary",
          narrative: "Acquisition route",
          stage: "current",
          orderIndex: 20,
        },
      ],
      datasets: [{ slug: "droid", title: "DROID", role: "release" }],
      standards: [{ slug: "rlds", title: "RLDS", role: "adoption" }],
      collectionMethods: [
        { slug: "teleoperation", title: "Robot teleoperation", role: "demonstration" },
      ],
      peers: [{ slug: "example-lab", title: "Example Lab", role: "claim" }],
    });

    expect(projected).toMatchObject({
      slug: "embodied-event",
      dataProfile: profile,
      datasets: [{ slug: "droid", role: "release" }],
      pipelineStages: ["acquisition-route"],
    });
    expect(projected).not.toHaveProperty("id");
    expect(JSON.stringify(projected)).not.toContain("private-event-id");
  });

  it("projects domain objects without persistence metadata", () => {
    const datasetProfile: DatasetProfile = {
      name: "DROID",
      version: "1",
      publisher: "DROID Team",
      releaseDate: "2024-03-19",
      canonicalUrl: "https://example.com/droid",
      pipelineStages: ["acquisition-route"],
      scenarios: ["in-the-wild manipulation"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "action"],
      acquisitionMethods: ["teleoperation"],
      scaleClaims: [],
      dataFormats: ["trajectory dataset"],
      sensorConfiguration: [],
      synchronization: [],
      calibration: [],
      annotations: [],
      qualityMethods: ["schema validation"],
      license: null,
      access: { mode: "open", url: "https://example.com/droid" },
      useCases: ["robot policy training"],
      knownResults: [],
      limitations: ["Published coverage is bounded."],
      evidenceStatus: "verified",
    };
    const record: DomainObjectRecord<DatasetProfile> = {
      id: "private-dataset-id",
      slug: "droid",
      profile: datasetProfile,
      schemaVersion: 1,
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };

    const projected = projectPublicDataset(record, [
      { slug: "embodied-event", title: "Embodied event", role: "release" },
    ]);

    expect(projected).toMatchObject({
      slug: "droid",
      name: "DROID",
      relatedEvents: [{ slug: "embodied-event", role: "release" }],
    });
    expect(projected).not.toHaveProperty("id");
    expect(projected).not.toHaveProperty("profile");
    expect(projected).not.toHaveProperty("schemaVersion");
    expect(projected).not.toHaveProperty("createdAt");
    expect(projected).not.toHaveProperty("updatedAt");
  });

  it("projects peer claims with explicit verification state and evidence", () => {
    const peer: PeerCompanyProfile = {
      actorId: "private-actor-id",
      actorSlug: "example-lab",
      actorName: "Example Lab",
      contentScope: "embodied-data",
      capabilities: [
        {
          capabilityKey: "teleoperation-stack",
          pipelineStages: ["acquisition-route"],
          claimText: "Example Lab claims an operational teleoperation data production stack.",
          claimant: "company",
          sourceUrl: "https://example.com/evidence",
          claimedAt: "2026-09-20T00:00:00.000Z",
          verificationStatus: "self-claimed",
          verifiedAt: null,
          confidence: 60,
          limitations: ["The claim has not been independently audited."],
        },
      ],
    };

    const projected = projectPublicPeer(
      peer,
      {
        actorType: "company",
        region: "CN",
        websiteUrl: "https://example.com",
      },
      new Map([
        [
          "teleoperation-stack",
          [{ slug: "embodied-event", title: "Embodied event", role: "claim" }],
        ],
      ]),
    );

    expect(projected).toMatchObject({
      slug: "example-lab",
      capabilities: [
        {
          verificationStatus: "self-claimed",
          evidence: [{ slug: "embodied-event", role: "claim" }],
        },
      ],
    });
    expect(projected).not.toHaveProperty("actorId");
    expect(JSON.stringify(projected)).not.toContain("private-actor-id");
  });

  it("rejects malformed event profiles before projection", () => {
    expect(() =>
      projectPublicEmbodiedEvent(
        event,
        { ...profile, pipelineStages: [] },
        {
          tracks: [],
          datasets: [],
          standards: [],
          collectionMethods: [],
          peers: [],
        },
      ),
    ).toThrow();
  });
});
