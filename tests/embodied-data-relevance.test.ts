import { describe, expect, it } from "vitest";
import {
  assessEmbodiedDataRelevance,
  type EmbodiedDataRelevanceInput,
} from "../src/domain/embodied-data-relevance.js";
import cases from "./fixtures/embodied-data/relevance-cases.json" with { type: "json" };

const reasonCodes = new Set([
  "embodied_anchor_matched",
  "embodied_anchor_missing",
  "data_pipeline_anchor_missing",
  "data_impact_too_thin",
  "production_impact_matched",
  "production_impact_ambiguous",
  "pipeline_stage_matched",
  "embodied_data_scope_matched",
  "excluded_turing_test",
  "excluded_generic_agent",
  "excluded_architecture_only",
  "excluded_financing_only",
  "excluded_control_only",
  "excluded_perception_only",
  "original_source_missing",
]);

describe("embodied data relevance", () => {
  it("keeps a balanced positive, boundary, and negative golden set", () => {
    const counts = cases.reduce<Record<string, number>>((result, fixture) => {
      result[fixture.expected.decision] = (result[fixture.expected.decision] ?? 0) + 1;
      return result;
    }, {});

    expect(counts.include).toBeGreaterThanOrEqual(12);
    expect(counts.review).toBeGreaterThanOrEqual(8);
    expect(counts.reject).toBeGreaterThanOrEqual(12);
  });

  it.each(cases)("matches the golden decision for $name", ({ input, expected }) => {
    const assessment = assessEmbodiedDataRelevance(input as EmbodiedDataRelevanceInput);

    expect(assessment.decision).toBe(expected.decision);
    expect(assessment.matchedStages).toEqual(expected.matchedStages);
    expect(assessment.embodimentAnchor.matched).toBe(
      assessment.embodimentAnchor.matchedTerms.length > 0,
    );
    expect(assessment.productionImpact.matched).toBe(
      assessment.productionImpact.matchedTerms.length > 0,
    );
  });

  it("uses stable machine-readable reason codes", () => {
    for (const fixture of cases) {
      const assessment = assessEmbodiedDataRelevance(fixture.input as EmbodiedDataRelevanceInput);
      expect(assessment.reasons.length).toBeGreaterThan(0);
      expect(assessment.reasons.every((reason) => reasonCodes.has(reason))).toBe(true);
    }
  });
});
