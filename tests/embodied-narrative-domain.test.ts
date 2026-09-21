import { describe, expect, it } from "vitest";
import { EmbodiedPipelineStageSchema } from "../src/domain/embodied-data.js";
import {
  EmbodiedTrendSchema,
  EvolutionPhaseSchema,
  PhaseStageImpactSchema,
} from "../src/domain/embodied-narrative.js";

const supportedImpact = {
  summary: "Public evidence shows how this phase changes one production decision.",
  eventSlugs: ["embodied-event"],
  evidenceState: "supported" as const,
};

const noPublicEvidenceImpact = {
  summary: "No public event supports a specific operational impact for this stage yet.",
  eventSlugs: [],
  evidenceState: "no-public-evidence" as const,
};

function validPhase() {
  return {
    slug: "scaled-robot-data-production",
    start: "2025-04-15",
    end: "2026-09-20",
    title: "Robot data production becomes an operating system",
    thesis: "Collection, quality, and training feedback converge into one production loop.",
    turningPoint: "Teams expose production infrastructure rather than isolated datasets.",
    eventSlugs: ["embodied-event"],
    stageImpacts: Object.fromEntries(
      EmbodiedPipelineStageSchema.options.map((stage) => [stage, supportedImpact]),
    ),
    counterEventSlugs: ["counter-evidence"],
    nextSignals: ["Watch for independently verified throughput and training gain."],
  };
}

function validTrend() {
  return {
    slug: "production-feedback-loops",
    title: "Production feedback loops become the bottleneck",
    thesis:
      "Data collection quality increasingly depends on training outcomes and operator feedback.",
    whyNow:
      "New public releases connect data operations with measured training and deployment results.",
    pipelineStages: ["production-operations", "quality-training-feedback"],
    eventSlugs: ["embodied-event", "embodied-event-two"],
    counterEventSlugs: ["counter-evidence"],
    nextWatch: ["Watch for public evidence that links field quality controls to training gains."],
  };
}

describe("embodied narrative domain", () => {
  it("accepts a complete phase and trend contract", () => {
    expect(EvolutionPhaseSchema.parse(validPhase()).slug).toBe("scaled-robot-data-production");
    expect(EmbodiedTrendSchema.parse(validTrend()).slug).toBe("production-feedback-loops");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => EvolutionPhaseSchema.parse({ ...validPhase(), start: "2025-02-29" })).toThrow();
    expect(() => EvolutionPhaseSchema.parse({ ...validPhase(), end: "2025-13-01" })).toThrow();
  });

  it("requires exactly the six embodied pipeline stage impacts", () => {
    const phase = validPhase();
    expect(
      EvolutionPhaseSchema.safeParse({
        ...phase,
        stageImpacts: { "demand-definition": supportedImpact },
      }).success,
    ).toBe(false);
    expect(
      EvolutionPhaseSchema.safeParse({
        ...phase,
        stageImpacts: { ...phase.stageImpacts, unsupported: supportedImpact },
      }).success,
    ).toBe(false);
  });

  it("requires unique event slugs and enough main events for each narrative record", () => {
    expect(
      EvolutionPhaseSchema.safeParse({
        ...validPhase(),
        eventSlugs: ["embodied-event", "embodied-event"],
      }).success,
    ).toBe(false);
    expect(EvolutionPhaseSchema.safeParse({ ...validPhase(), eventSlugs: [] }).success).toBe(false);
    expect(
      EmbodiedTrendSchema.safeParse({
        ...validTrend(),
        eventSlugs: ["embodied-event", "embodied-event"],
      }).success,
    ).toBe(false);
    expect(
      EmbodiedTrendSchema.safeParse({ ...validTrend(), eventSlugs: ["embodied-event"] }).success,
    ).toBe(false);
    expect(
      PhaseStageImpactSchema.safeParse({
        ...supportedImpact,
        eventSlugs: ["embodied-event", "embodied-event"],
      }).success,
    ).toBe(false);
  });

  it("makes evidence absence machine-checkable", () => {
    expect(PhaseStageImpactSchema.parse(noPublicEvidenceImpact)).toEqual(noPublicEvidenceImpact);
    expect(
      PhaseStageImpactSchema.safeParse({
        ...noPublicEvidenceImpact,
        eventSlugs: ["embodied-event"],
      }).success,
    ).toBe(false);
    expect(PhaseStageImpactSchema.safeParse({ ...supportedImpact, eventSlugs: [] }).success).toBe(
      false,
    );
    expect(
      PhaseStageImpactSchema.safeParse({
        ...supportedImpact,
        evidenceState: "limited",
        eventSlugs: [],
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields and empty editorial content", () => {
    expect(
      EvolutionPhaseSchema.safeParse({ ...validPhase(), sourceUrl: "https://example.com" }).success,
    ).toBe(false);
    expect(EmbodiedTrendSchema.safeParse({ ...validTrend(), whyNow: " " }).success).toBe(false);
  });
});
