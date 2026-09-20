import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type EmbodiedEventEvidence,
  embodiedEventEvidence,
} from "../src/catalog/embodied-data/event-evidence.js";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedSourceSlugs } from "../src/catalog/embodied-data/sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  EmbodiedPipelineStageSchema,
  EventDataProfileSchema,
  EvidenceUrlSchema,
} from "../src/domain/embodied-data.js";
import { evaluateEventReadiness } from "../src/pipeline/readiness.js";

const manifestPath = fileURLToPath(
  new URL("fixtures/embodied-data/launch/event-source-manifest.json", import.meta.url),
);
const stages = EmbodiedPipelineStageSchema.options;
const negativeGoldenSet = [/GPT-[\d.]+/i, /通用大模型/, /AI Act/i, /Codex/i];
const evidenceBySlug = new Map(embodiedEventEvidence.map((row) => [row.slug, row]));

function clearsEvidenceThreshold(rows: EmbodiedEventEvidence[]): boolean {
  return (
    rows.some((row) => row.sourceTier === 1 && row.role === "primary") ||
    new Set(rows.filter((row) => row.sourceTier === 2).map((row) => row.sourceIdentity)).size >= 2
  );
}

describe("embodied data launch corpus", () => {
  it("retains the launch corpus with unique, pipeline-relevant events", () => {
    expect(embodiedLaunchEvents.length).toBeGreaterThanOrEqual(36);
    expect(new Set(embodiedLaunchEvents.map((event) => event.slug)).size).toBe(
      embodiedLaunchEvents.length,
    );

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

  it("backfills independently evidenced events through the current research window", () => {
    const currentWindow = embodiedLaunchEvents.filter(
      (event) => event.date >= "2025-04-15T00:00:00.000Z",
    );
    expect(currentWindow.length).toBeGreaterThan(0);
    expect(currentWindow.some((event) => event.date >= "2026-08-01T00:00:00.000Z")).toBe(true);
    for (const event of currentWindow) {
      const evidence = event.evidenceSlugs.map((slug) => evidenceBySlug.get(slug));
      expect(evidence.every(Boolean), event.slug).toBe(true);
      const rows = evidence.filter((row) => row !== undefined);
      expect(clearsEvidenceThreshold(rows), event.slug).toBe(true);
      for (const field of [
        event.fact,
        event.interpretation,
        event.futureWatch,
        event.recommendedAction,
      ])
        expect(field.trim().length, event.slug).toBeGreaterThan(20);
    }
  });

  it("preserves publication readiness and publisher independence when backfill is seeded", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      const events = await db
        .selectFrom("events")
        .selectAll()
        .where("content_scope", "=", "embodied-data")
        .where("happened_at", ">=", "2025-04-15T00:00:00.000Z")
        .execute();
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        const readiness = await evaluateEventReadiness(db, event.id);
        expect(readiness.blockers, event.slug).toEqual([]);
        expect(readiness.status, event.slug).toBe("ready");
      }
      const itu = events.find((event) => event.slug === "itu-robot-data-factory");
      expect(itu).toBeDefined();
      if (!itu) throw new Error("Missing ITU backfill event");
      expect(JSON.parse(itu.score_factors_json)).toMatchObject({
        independentSources: 1,
        uniqueAuthors: 1,
        corroboration: 75,
      });
      const evidence = await db
        .selectFrom("event_signals")
        .innerJoin("signals", "signals.id", "event_signals.signal_id")
        .select(["signals.canonical_url", "signals.metrics_json"])
        .where("event_signals.event_id", "=", itu.id)
        .execute();
      expect(new Set(evidence.map((row) => row.canonical_url)).size).toBe(2);
      for (const row of evidence) expect(JSON.parse(row.metrics_json).independentSources).toBe(1);
    } finally {
      await db.destroy();
    }
  });

  it("does not count two URLs owned by the same Tier 2 identity as independent evidence", () => {
    const first: EmbodiedEventEvidence = {
      slug: "same-owner-first",
      eventSlug: "same-owner-event",
      sourceSlug: "same-owner-channel",
      sourceIdentity: "Same Publisher",
      sourceTier: 2,
      role: "corroborating",
      title: "First report",
      url: "https://example.com/first",
      publishedAt: "2026-08-01T00:00:00.000Z",
    };
    const second = { ...first, slug: "same-owner-second", url: "https://example.com/second" };
    expect(clearsEvidenceThreshold([first, second])).toBe(false);
    expect(
      clearsEvidenceThreshold([first, { ...second, sourceIdentity: "Another Publisher" }]),
    ).toBe(true);
  });

  it("uses safe first-class evidence and satisfies the publication threshold", () => {
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
      expect(clearsEvidenceThreshold(rows), event.slug).toBe(true);
      expect(
        rows.every((row) => row.eventSlug === event.slug),
        event.slug,
      ).toBe(true);

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
