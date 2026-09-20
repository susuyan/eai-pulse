import { describe, expect, it } from "vitest";
import {
  assessEmbodiedDataRelevance,
  type EmbodiedDataRelevanceInput,
} from "../src/domain/embodied-data-relevance.js";
import cases from "./fixtures/embodied-data/relevance-cases.json" with { type: "json" };

const reasonCodes = new Set([
  "embodied_anchor_missing",
  "data_pipeline_anchor_missing",
  "data_impact_too_thin",
  "pipeline_stage_matched",
  "embodied_data_scope_matched",
]);

describe("embodied data relevance", () => {
  it.each(cases)("matches the golden decision for $name", ({ input, expected }) => {
    const assessment = assessEmbodiedDataRelevance(input as EmbodiedDataRelevanceInput);

    expect(assessment.decision).toBe(expected.decision);
    expect(assessment.matchedStages).toEqual(expected.matchedStages);
  });

  it("uses stable machine-readable reason codes", () => {
    for (const fixture of cases) {
      const assessment = assessEmbodiedDataRelevance(fixture.input as EmbodiedDataRelevanceInput);
      expect(assessment.reasons.length).toBeGreaterThan(0);
      expect(assessment.reasons.every((reason) => reasonCodes.has(reason))).toBe(true);
    }
  });
});
