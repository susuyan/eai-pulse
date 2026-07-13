import { describe, expect, it } from "vitest";
import { earlyHistoryEvents } from "../src/catalog/early-history.js";
import { historicalEvents, industryNarratives } from "../src/catalog/history.js";
import { sourceCatalog } from "../src/catalog/sources.js";

describe("two-year industry history", () => {
  it("starts at the public generative AI turning point with first-party evidence", () => {
    const sourceBySlug = new Map(sourceCatalog.map((source) => [source.slug, source]));
    expect(earlyHistoryEvents.length).toBeGreaterThanOrEqual(12);
    expect(earlyHistoryEvents[0]?.date).toBe("2022-08-22T00:00:00.000Z");
    expect(earlyHistoryEvents.some((event) => event.slug === "chatgpt-research-preview")).toBe(
      true,
    );
    for (const milestone of earlyHistoryEvents) {
      expect(milestone.date >= "2022-08-01").toBe(true);
      expect(milestone.date < "2024-01-01").toBe(true);
      expect(sourceBySlug.get(milestone.source)?.role).not.toBe("aggregator");
      expect(new URL(milestone.url).protocol).toBe("https:");
      expect(milestone.scores[1]).toBe(0);
    }
  });

  it("contains a dense, source-backed and non-aggregator milestone baseline", () => {
    const sourceBySlug = new Map(sourceCatalog.map((source) => [source.slug, source]));
    const slugs = new Set(historicalEvents.map((event) => event.slug));
    expect(historicalEvents.length).toBeGreaterThanOrEqual(30);
    expect(slugs.size).toBe(historicalEvents.length);
    for (const event of historicalEvents) {
      expect(event.date >= "2024-07-01").toBe(true);
      expect(event.date <= "2026-07-11T23:59:59.999Z").toBe(true);
      expect(new URL(event.url).protocol).toBe("https:");
      expect(sourceBySlug.get(event.source)?.role).not.toBe("aggregator");
      expect(event.scores[1]).toBe(0);
      expect(event.summary.length).toBeGreaterThan(30);
      expect(event.business.length).toBeGreaterThan(20);
    }
    expect(
      historicalEvents.filter((event) => event.tracks.includes("global-innovation")).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("provides six executive narratives with staged China comparisons", () => {
    expect(industryNarratives.horizon.start).toBe("2022-08-22");
    expect(industryNarratives.eras).toHaveLength(6);
    expect(
      industryNarratives.eras.some((era) =>
        era.projects.some((project) => project.status !== "active"),
      ),
    ).toBe(true);
    for (const era of industryNarratives.eras) {
      expect(era.projects.length).toBeGreaterThanOrEqual(2);
      for (const project of era.projects) expect(new URL(project.url).protocol).toBe("https:");
    }
    expect(industryNarratives.tracks).toHaveLength(6);
    expect(
      industryNarratives.tracks.every(
        (track) => track.stages.length >= 3 && track.stages.every((stage) => stage.chinaPosition),
      ),
    ).toBe(true);
  });
});
