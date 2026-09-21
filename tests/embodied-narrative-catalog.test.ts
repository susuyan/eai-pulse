import { describe, expect, it } from "vitest";
import { embodiedEventEvidence } from "../src/catalog/embodied-data/event-evidence.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedTrends, evolutionPhases } from "../src/catalog/embodied-data/evolution.js";
import { EmbodiedPipelineStageSchema } from "../src/domain/embodied-data.js";
import type { EmbodiedTrend, EvolutionPhase } from "../src/domain/embodied-narrative.js";
import type { PublicEmbodiedEvent } from "../src/pipeline/static-site/dto.js";
import { buildPublicEmbodiedNarrative } from "../src/pipeline/static-site/embodied-narrative.js";
import { embodiedSiteModel } from "./fixtures/embodied-site-model.js";

type PhasePair = [EvolutionPhase, EvolutionPhase];

function fixture() {
  const template = embodiedSiteModel().embodiedEvents[0];
  if (!template) throw new Error("Missing embodied Event fixture");
  const events: [PublicEmbodiedEvent, PublicEmbodiedEvent, ...PublicEmbodiedEvent[]] = [
    { ...template, slug: "early-event", title: "Early event", happenedAt: "2022-06-15T00:00:00Z" },
    { ...template, slug: "late-event", title: "Late event", happenedAt: "2024-03-19T00:00:00Z" },
  ];
  const phase = (slug: string, start: string, end: string, eventSlug: string): EvolutionPhase => ({
    slug,
    start,
    end,
    title: "Evidence-bound phase",
    thesis: "Published Events bound the interpretation of this phase.",
    turningPoint: "The referenced release supplies the phase turning point.",
    eventSlugs: [eventSlug],
    stageImpacts: {
      "demand-definition": {
        summary: "A public task definition supports this production decision.",
        eventSlugs: [eventSlug],
        evidenceState: "supported",
      },
      ...Object.fromEntries(
        EmbodiedPipelineStageSchema.options.slice(1).map((stage) => [
          stage,
          {
            summary: "No published Event supports a conclusion for this stage.",
            eventSlugs: [],
            evidenceState: "no-public-evidence",
          },
        ]),
      ),
    } as EvolutionPhase["stageImpacts"],
    counterEventSlugs: [],
    nextSignals: ["Watch for public evidence of repeatable production outcomes."],
  });
  const phases: PhasePair = [
    phase("early-phase", "2022-01-31", "2022-12-31", "early-event"),
    phase("late-phase", "2023-01-01", "2026-09-20", "late-event"),
  ];
  const trends: [EmbodiedTrend] = [
    {
      slug: "shared-theme",
      title: "Cross-event theme",
      thesis: "Two published Events support a bounded editorial interpretation.",
      whyNow: "The releases make a shared production question observable.",
      pipelineStages: ["demand-definition"],
      eventSlugs: ["early-event", "late-event"],
      counterEventSlugs: [],
      nextWatch: ["Watch for independent reproduction before broader adoption."],
    },
  ];
  return { events, phases, trends };
}

describe("embodied narrative catalog", () => {
  it("resolves six contiguous phases and at least eight themes against the published corpus", () => {
    const template = embodiedSiteModel().embodiedEvents[0];
    if (!template) throw new Error("Missing embodied Event fixture");
    const events = embodiedLaunchEvents.map((event) => ({
      ...template,
      slug: event.slug,
      title: event.title,
      happenedAt: event.date,
      publishedAt: event.date,
      pipelineStages: event.dataProfile.pipelineStages,
      dataProfile: event.dataProfile,
      evidence: embodiedEventEvidence
        .filter((entry) => entry.eventSlug === event.slug)
        .map((entry) => ({
          title: entry.title,
          source: entry.sourceIdentity,
          role: entry.role,
          url: entry.url,
          publishedAt: entry.publishedAt,
        })),
    }));
    const result = buildPublicEmbodiedNarrative(events, evolutionPhases, embodiedTrends);
    expect(result.phases).toHaveLength(6);
    expect(result.phases[0]?.start).toBe("2022-01-31");
    expect(result.phases.at(-1)?.end).toBe("2026-09-20");
    expect(result.trends.length).toBeGreaterThanOrEqual(8);
    const stages = new Set(result.trends.flatMap((trend) => trend.pipelineStages));
    expect([...stages].sort()).toEqual([...EmbodiedPipelineStageSchema.options].sort());
    expect(
      result.phases.some((phase) =>
        Object.values(phase.stageImpacts).some(
          (impact) => impact.evidenceState === "no-public-evidence" && impact.events.length === 0,
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify([evolutionPhases, embodiedTrends, result])).not.toMatch(/https?:\/\//);
  });

  it("sorts phases chronologically without changing the curated input", () => {
    const { events, phases, trends } = fixture();
    phases.reverse();
    const result = buildPublicEmbodiedNarrative(events, phases, trends);
    expect(result.phases.map((phase) => phase.slug)).toEqual(["early-phase", "late-phase"]);
    expect(phases[0].slug).toBe("late-phase");
  });

  it.each([
    [
      "overlap",
      (phases: PhasePair) => {
        phases[1].start = "2022-12-31";
      },
      /overlap/,
    ],
    [
      "gap",
      (phases: PhasePair) => {
        phases[1].start = "2023-01-02";
      },
      /gap/,
    ],
    [
      "reversed range",
      (phases: PhasePair) => {
        phases[0].end = "2022-01-30";
      },
      /reversed/,
    ],
    [
      "wrong start",
      (phases: PhasePair) => {
        phases[0].start = "2022-01-30";
      },
      /outer range/,
    ],
    [
      "wrong end",
      (phases: PhasePair) => {
        phases[1].end = "2026-09-21";
      },
      /outer range/,
    ],
    [
      "duplicate slug",
      (phases: PhasePair) => {
        phases[1].slug = phases[0].slug;
      },
      /duplicate phase/,
    ],
  ] as const)("rejects a phase %s", (_name, mutate, error) => {
    const { events, phases, trends } = fixture();
    mutate(phases);
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow(error);
  });

  it("rejects an empty phase range", () => {
    const { events, trends } = fixture();
    expect(() => buildPublicEmbodiedNarrative(events, [], trends)).toThrow(/outer range/);
  });

  it("rejects duplicate trend slugs", () => {
    const { events, phases, trends } = fixture();
    expect(() => buildPublicEmbodiedNarrative(events, phases, [...trends, trends[0]])).toThrow(
      /duplicate trend/,
    );
  });

  it.each([
    "main",
    "stage",
    "phase counter",
    "trend",
    "trend counter",
  ])("rejects unknown %s references", (kind) => {
    const { events, phases, trends } = fixture();
    if (kind === "main") phases[0].eventSlugs = ["unknown-event"];
    if (kind === "stage")
      phases[0].stageImpacts["demand-definition"].eventSlugs = ["unknown-event"];
    if (kind === "phase counter") phases[0].counterEventSlugs = ["unknown-event"];
    if (kind === "trend") trends[0].eventSlugs[0] = "legacy-event";
    if (kind === "trend counter") trends[0].counterEventSlugs = ["unknown-event"];
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow(
      /unknown event.*embodied-data/i,
    );
  });

  it.each(["main", "stage"])("rejects an out-of-range phase %s Event", (kind) => {
    const { events, phases, trends } = fixture();
    if (kind === "main") phases[0].eventSlugs.push("late-event");
    else phases[0].stageImpacts["demand-definition"].eventSlugs = ["late-event"];
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow(
      /outside phase range/,
    );
  });

  it("requires stage references to belong to the phase main Events", () => {
    const { events, phases, trends } = fixture();
    events.push({ ...events[0], slug: "unlisted-event" });
    phases[0].stageImpacts["demand-definition"].eventSlugs = ["unlisted-event"];
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow(/phase main events/);
  });

  it("keeps out-of-range counter-events separate and explicitly labeled", () => {
    const { events, phases, trends } = fixture();
    phases[0].counterEventSlugs = ["late-event"];
    const result = buildPublicEmbodiedNarrative(events, phases, trends);
    expect(result.phases[0]?.counterEvents).toEqual([
      { slug: "late-event", title: "Late event", role: "counter-evidence" },
    ]);
    expect(result.phases[0]?.events).toEqual([
      { slug: "early-event", title: "Early event", role: "supporting-evidence" },
    ]);
  });

  it.each(["phase", "trend"])("rejects intersecting main and counter sets for a %s", (kind) => {
    const { events, phases, trends } = fixture();
    if (kind === "phase") phases[0].counterEventSlugs = ["early-event"];
    else trends[0].counterEventSlugs = ["early-event"];
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow(/disjoint/);
  });

  it.each([
    ["2022-01-30T16:00:00Z", true],
    ["2022-01-30T15:59:59Z", false],
    ["2022-12-31T15:59:59Z", true],
    ["2022-12-31T16:00:00Z", false],
    ["invalid-timestamp", false],
  ])("checks the Shanghai calendar date of %s", (timestamp, accepted) => {
    const { events, phases, trends } = fixture();
    events[0].happenedAt = timestamp;
    const build = () => buildPublicEmbodiedNarrative(events, phases, trends);
    if (accepted) expect(build).not.toThrow();
    else expect(build).toThrow(/outside phase range|invalid event timestamp/i);
  });

  it.each(["single", "duplicate"])("rejects a trend with %s Event evidence", (kind) => {
    const { events, phases, trends } = fixture();
    trends[0].eventSlugs = kind === "single" ? ["early-event"] : ["early-event", "early-event"];
    expect(() => buildPublicEmbodiedNarrative(events, phases, trends)).toThrow();
  });

  it.each(["unpublished", "legacy"])("rejects a referenced %s Event in the input map", (kind) => {
    const { events, phases, trends } = fixture();
    const invalid = {
      ...events[0],
      ...(kind === "unpublished" ? { publishedAt: null } : { dataProfile: undefined }),
    };
    expect(() =>
      buildPublicEmbodiedNarrative(
        [invalid as unknown as PublicEmbodiedEvent, events[1]],
        phases,
        trends,
      ),
    ).toThrow(/published embodied-data/);
  });

  it("parses strict schemas before resolving references", () => {
    const { events, phases, trends } = fixture();
    expect(() =>
      buildPublicEmbodiedNarrative(
        events,
        [{ ...phases[0], privateNote: "private" }, phases[1]] as unknown as EvolutionPhase[],
        trends,
      ),
    ).toThrow();
    expect(() =>
      buildPublicEmbodiedNarrative(events, phases, [
        { ...trends[0], evidenceUrl: "https://example.com" },
      ] as unknown as EmbodiedTrend[]),
    ).toThrow();
  });
});
