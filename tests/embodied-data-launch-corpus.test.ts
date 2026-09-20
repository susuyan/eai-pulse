import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { embodiedEventEvidence } from "../src/catalog/embodied-data/event-evidence.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedSourceSlugs } from "../src/catalog/embodied-data/sources.js";
import {
  EmbodiedPipelineStageSchema,
  EventDataProfileSchema,
  EvidenceUrlSchema,
} from "../src/domain/embodied-data.js";

const manifestPath = fileURLToPath(
  new URL("fixtures/embodied-data/launch/event-source-manifest.json", import.meta.url),
);
const stages = EmbodiedPipelineStageSchema.options;
const negativeGoldenSet = [/GPT-[\d.]+/i, /通用大模型/, /AI Act/i, /Codex/i];

describe("embodied data launch corpus", () => {
  it("contains exactly 36 reviewed, stable and pipeline-relevant events", () => {
    expect(embodiedLaunchEvents).toHaveLength(36);
    expect(new Set(embodiedLaunchEvents.map((event) => event.slug)).size).toBe(36);

    for (const event of embodiedLaunchEvents) {
      expect(event.contentScope).toBe("embodied-data");
      expect(event.date >= "2022-01-01T00:00:00.000Z").toBe(true);
      expect(event.date <= "2026-09-20T23:59:59.999Z").toBe(true);
      expect(event.tracks.length).toBeGreaterThan(0);
      expect(event.tracks.every((track) => stages.includes(track))).toBe(true);
      expect(EventDataProfileSchema.parse(event.dataProfile)).toEqual(event.dataProfile);
      expect(event.evidenceSlugs.length).toBeGreaterThan(0);
      for (const pattern of negativeGoldenSet) expect(event.title).not.toMatch(pattern);
    }

    for (const stage of stages) {
      expect(
        embodiedLaunchEvents.filter((event) => event.dataProfile.pipelineStages.includes(stage))
          .length,
        stage,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses safe first-class evidence and satisfies the publication threshold", () => {
    const evidenceBySlug = new Map(
      embodiedEventEvidence.map((evidence) => [evidence.slug, evidence]),
    );
    expect(evidenceBySlug.size).toBe(embodiedEventEvidence.length);

    for (const evidence of embodiedEventEvidence) {
      expect(embodiedSourceSlugs.has(evidence.sourceSlug)).toBe(true);
      expect(EvidenceUrlSchema.parse(evidence.url)).toBe(evidence.url);
      expect(evidence.publishedAt <= "2026-09-20T23:59:59.999Z").toBe(true);
    }

    for (const event of embodiedLaunchEvents) {
      const evidence = event.evidenceSlugs.map((slug) => evidenceBySlug.get(slug));
      expect(evidence.every(Boolean), event.slug).toBe(true);
      const rows = evidence.filter((row) => row !== undefined);
      const tier1 = rows.some((row) => row.sourceTier === 1 && row.role === "primary");
      const tier2Identities = new Set(
        rows.filter((row) => row.sourceTier === 2).map((row) => row.sourceIdentity),
      );
      expect(tier1 || tier2Identities.size >= 2, event.slug).toBe(true);

      const urls = new Set(rows.map((row) => row.url));
      for (const claim of event.dataProfile.scaleClaims)
        expect(urls.has(claim.sourceUrl)).toBe(true);
      for (const signal of event.dataProfile.costSignals) expect(signal).not.toMatch(/\d/);
    }
  });

  it("keeps a verified source manifest for every evidence row", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Array<{
      evidenceSlug: string;
      eventSlug: string;
      url: string;
      verifiedAt: string;
    }>;
    expect(manifest).toHaveLength(embodiedEventEvidence.length);
    expect(new Set(manifest.map((row) => row.evidenceSlug)).size).toBe(manifest.length);

    for (const evidence of embodiedEventEvidence) {
      expect(manifest).toContainEqual({
        evidenceSlug: evidence.slug,
        eventSlug: evidence.eventSlug,
        url: evidence.url,
        verifiedAt: "2026-09-20T00:00:00.000Z",
      });
    }
  });
});
