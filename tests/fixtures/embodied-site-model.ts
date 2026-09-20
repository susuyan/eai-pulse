import type { EnrichedEvent, StaticSiteModel } from "../../src/pipeline/static-site/dto.js";

export function embodiedSiteModel(): StaticSiteModel {
  const happenedAt = "2026-09-20T00:00:00.000Z";
  const legacyEvent: EnrichedEvent = {
    id: "embodied-event",
    slug: "embodied-event",
    title: "embodied-event",
    factSummary: "Verified fact",
    summary: "Context",
    technicalInsight: "Technical change",
    industryInsight: "Industry impact",
    futureOutlook: "Next signal",
    businessValue: "Decision value",
    category: "product",
    company: "Example",
    keywords: [],
    confidenceScore: 80,
    heatScore: 60,
    impactScore: 70,
    valueScore: 75,
    scoreFactors: {
      authority: 80,
      corroboration: 70,
      primaryEvidence: 1,
      uniqueAuthors: 1,
      independentSources: 1,
      platformBreadth: 1,
      regionBreadth: 1,
      velocity: 1,
      freshness: 1,
      crossRegion: false,
    },
    featured: false,
    happenedAt,
    publishedAt: happenedAt,
    evidence: [
      {
        title: "Primary evidence",
        role: "primary",
        publishedAt: happenedAt,
        source: "Example Lab",
        url: "https://example.com/evidence",
      },
    ],
    tracks: [],
    actors: [],
  };
  const { id: _id, actors: _actors, ...publicEvent } = legacyEvent;
  const pipelineStages = [
    [
      "demand-definition",
      "需求与任务定义",
      "Demand and task definition",
      "Decide what data to collect and why.",
      "01",
    ],
    [
      "acquisition-route",
      "采集技术路线",
      "Acquisition route",
      "Compare collection and production routes.",
      "02",
    ],
    [
      "multimodal-capture",
      "多模态采集设备",
      "Multimodal capture",
      "Track synchronized multimodal capture.",
      "03",
    ],
    [
      "production-operations",
      "生产运营与成本",
      "Production operations and cost",
      "Track throughput, cost, and delivery.",
      "04",
    ],
    [
      "data-engineering-standards",
      "数据工程与标准",
      "Data engineering and standards",
      "Track formats and governance standards.",
      "05",
    ],
    [
      "quality-training-feedback",
      "质量验收与训练反馈",
      "Quality acceptance and training feedback",
      "Feed evaluation results into collection.",
      "06",
    ],
  ].map(([slug, name, nameEn, descriptionEn, icon], order) => ({
    slug,
    name,
    description: `${name}说明`,
    nameEn,
    descriptionEn,
    color: "#345",
    icon,
    order,
    milestones:
      slug === "acquisition-route"
        ? [
            {
              eventSlug: "embodied-event",
              title: "embodied-event",
              happenedAt,
              deliveryImpact:
                "Defines the production and acceptance boundary for a robot data run.",
              evidenceStatus: "verified",
              evidence: legacyEvent.evidence,
            },
          ]
        : [],
    peerComparisons:
      slug === "acquisition-route"
        ? [
            {
              peerSlug: "example-lab",
              peerName: "Example Lab",
              claimText: "Publishes a sourced teleoperation collection method.",
              verificationStatus: "independently-verified",
              sourceUrl: "https://example.com/lab/evidence",
            },
          ]
        : [],
    counterEvidence: [],
    nextSignals:
      slug === "acquisition-route"
        ? [{ eventSlug: "embodied-event", eventTitle: "embodied-event", signal: "Next signal" }]
        : [],
  }));

  return {
    siteUrl: "https://example.com/",
    generatedAt: happenedAt,
    events: [legacyEvent],
    tracks: pipelineStages.map((stage) => ({
      ...stage,
      kind: "pipeline",
      perspective: "production",
    })),
    actors: [],
    resources: [],
    sources: [
      {
        slug: "example-source",
        name: "Example Source",
        homepageUrl: "https://example.com/source",
        category: "official",
        region: "CN",
        tier: 1,
        role: "official",
        acquisition: "rss",
        topics: ["embodied-data"],
        mapStatus: "pending",
        pipelineStages: ["acquisition-route"],
        substituteFor: [],
        restrictionNote: "",
        maintenanceStatus: "maintained",
        lifecycle: "shadow",
        observationEnabled: false,
        qualityScore: 90,
        cadence: "weekly",
        healthStatus: "healthy",
        lastCheckedAt: null,
        latestItemAt: null,
        healthErrorCode: null,
      },
    ],
    signals: [],
    influencers: [],
    scout: [],
    narratives: { horizon: { start: "2026", end: "2026", label: "2026" }, eras: [], tracks: [] },
    product: {
      version: "0.12.0",
      generatedAt: happenedAt,
      capabilities: [],
      roadmap: [],
      releases: [],
      evaluation: null,
      sourceCoverage: {
        total: 1,
        active: 0,
        observing: 0,
        candidate: 1,
        regions: ["CN"],
        categories: ["official"],
      },
    },
    github: {
      repositoryUrl: "https://github.com/example/agent-pulse",
      stars: 1,
      forks: 0,
      openIssues: 0,
      latestRelease: "v0.12.0",
      fetchedAt: null,
    },
    embodiedEvents: [
      {
        ...publicEvent,
        pipelineStages: ["acquisition-route"],
        dataProfile: {
          pipelineStages: ["acquisition-route"],
          scenarios: ["tabletop manipulation"],
          embodiments: ["single-arm"],
          tasks: ["manipulation"],
          modalities: ["rgb", "action"],
          acquisitionMethods: ["teleoperation"],
          dataFormats: ["RLDS"],
          standards: ["RLDS"],
          scaleClaims: [],
          qualityMetrics: ["task completion"],
          costSignals: [],
          deliveryImpact: "Defines the production and acceptance boundary for a robot data run.",
          evidenceStatus: "verified",
        },
        datasets: [{ slug: "droid", title: "DROID", role: "release" }],
        standards: [],
        collectionMethods: [
          { slug: "teleoperation", title: "Robot teleoperation", role: "demonstration" },
        ],
        peers: [{ slug: "example-lab", title: "Example Lab", role: "claim" }],
      },
    ],
    pipelineStages,
    datasets: [],
    standards: [],
    collectionMethods: [],
    peers: [
      {
        slug: "example-lab",
        name: "Example Lab",
        actorType: "lab",
        region: "CN",
        websiteUrl: "https://example.com/lab",
        capabilities: [
          {
            capabilityKey: "teleoperation-collection",
            pipelineStages: ["acquisition-route"],
            claimText: "Publishes a sourced teleoperation collection method.",
            claimant: "independent",
            sourceUrl: "https://example.com/lab/evidence",
            claimedAt: happenedAt,
            verificationStatus: "independently-verified",
            verifiedAt: happenedAt,
            confidence: 90,
            limitations: [],
            evidence: [{ slug: "embodied-event", title: "Embodied event", role: "verification" }],
          },
        ],
      },
    ],
    sourceCoverageGaps: [],
  } as StaticSiteModel;
}
