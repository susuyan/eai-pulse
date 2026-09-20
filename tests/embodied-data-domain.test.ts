import { describe, expect, it } from "vitest";
import {
  ContentScopeSchema,
  EventDataProfileSchema,
  parseEventDataProfile,
} from "../src/domain/embodied-data.js";
import profiles from "./fixtures/embodied-data/data-profiles.json" with { type: "json" };

describe("embodied data domain", () => {
  it("accepts only the supported content scopes", () => {
    expect(ContentScopeSchema.parse("embodied-data")).toBe("embodied-data");
    expect(ContentScopeSchema.parse("legacy-ai")).toBe("legacy-ai");
    expect(() => ContentScopeSchema.parse("robotics-news")).toThrow();
  });

  it("parses the three representative data profiles", () => {
    expect(profiles.valid).toHaveLength(3);
    for (const profile of profiles.valid) {
      expect(EventDataProfileSchema.parse(profile)).toEqual(profile);
      expect(parseEventDataProfile(profile)).toEqual(profile);
    }
  });

  it("rejects empty stages, unknown modalities, and extra fields", () => {
    expect(() => EventDataProfileSchema.parse(profiles.invalid)).toThrow();
    expect(() => parseEventDataProfile(profiles.invalid)).toThrow();
  });
});
