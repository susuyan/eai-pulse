import { afterEach, describe, expect, it } from "vitest";
import { embodiedEventEvidence } from "../src/catalog/embodied-data/event-evidence.js";
import { embodiedSourceCatalog } from "../src/catalog/embodied-data/sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  SourceMapStatusSchema,
  SourcePipelineCoverageSchema,
} from "../src/domain/embodied-source-map.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function setup(seed = false) {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  if (seed) await seedDatabase(db);
  return db;
}

describe("embodied source governance schema", () => {
  it.each([
    ["invalid map status", { mapStatus: "unknown" }],
    ["empty pipeline coverage", { pipelineStages: [] }],
    ["unknown pipeline stage", { pipelineStages: ["unknown-stage"] }],
    ["unknown substitute reference", { substituteFor: ["missing-source"] }],
    ["self substitute reference", { substituteFor: ["samr-standards"] }],
    ["blank restriction note", { mapStatus: "restricted", restrictionNote: "  " }],
    [
      "integrated manual source",
      { mapStatus: "integrated", adapter: "manual", acquisition: "manual" },
    ],
  ])("rejects %s before persisting catalog rows", async (_name, invalid) => {
    const db = await setup();
    const source = embodiedSourceCatalog.find((candidate) => candidate.slug === "samr-standards");
    if (!source) throw new Error("Missing SAMR source");
    const original = { ...source };
    try {
      Object.assign(source, invalid);
      await expect(seedDatabase(db)).rejects.toThrow();
      expect(await db.selectFrom("sources").select("slug").execute()).toEqual([]);
    } finally {
      Object.assign(source, original);
    }
  });

  it("normalizes pipeline coverage before persisting the current catalog", async () => {
    const db = await setup();
    const source = embodiedSourceCatalog.find((candidate) => candidate.slug === "samr-standards");
    if (!source) throw new Error("Missing SAMR source");
    const original = source.pipelineStages;
    try {
      source.pipelineStages = ["multimodal-capture", "multimodal-capture", "demand-definition"];
      await seedDatabase(db);
      const stored = await db
        .selectFrom("sources")
        .select("pipeline_stages_json")
        .where("slug", "=", source.slug)
        .executeTakeFirstOrThrow();
      expect(JSON.parse(stored.pipeline_stages_json)).toEqual([
        "multimodal-capture",
        "demand-definition",
      ]);
    } finally {
      source.pipelineStages = original;
    }
  });

  it("provides a reviewed China-first source portfolio with explicit pipeline coverage", () => {
    expect(embodiedSourceCatalog.length).toBeGreaterThanOrEqual(80);
    expect(embodiedSourceCatalog.length).toBeLessThanOrEqual(100);
    const slugs = new Set(embodiedSourceCatalog.map((source) => source.slug));
    expect(slugs.size).toBe(embodiedSourceCatalog.length);
    expect(
      embodiedSourceCatalog.filter((source) => source.region === "CN").length,
    ).toBeGreaterThanOrEqual(Math.floor(embodiedSourceCatalog.length * 0.55));
    for (const source of embodiedSourceCatalog) {
      expect(SourceMapStatusSchema.parse(source.mapStatus)).toBe(source.mapStatus);
      expect(SourcePipelineCoverageSchema.parse(source.pipelineStages).length).toBeGreaterThan(0);
      expect(source.owner.trim().length).toBeGreaterThan(1);
      expect(source.robotsPolicy.trim().length).toBeGreaterThan(10);
      if (source.mapStatus === "substitute") {
        expect(source.substituteFor.length).toBeGreaterThan(0);
        for (const slug of source.substituteFor) {
          expect(slugs.has(slug)).toBe(true);
          expect(slug).not.toBe(source.slug);
        }
      }
      if (source.mapStatus === "restricted")
        expect(source.restrictionNote.trim().length).toBeGreaterThan(0);
      // The catalog has no source-specific adapter verification records yet.
      expect(source.mapStatus).not.toBe("integrated");
      if (source.adapter === "manual") {
        expect(source.lifecycleStatus).toBe("draft");
        expect(source.enabled).toBe(false);
      }
    }
  });

  it("does not count one owner and channel twice", () => {
    const identities = embodiedSourceCatalog.map(
      (source) => `${source.owner}:${source.homepageUrl}`,
    );
    expect(new Set(identities).size).toBe(identities.length);
    const droidEvidence = embodiedEventEvidence.filter((evidence) =>
      ["droid-paper", "droid-consortium-project"].includes(evidence.slug),
    );
    expect(droidEvidence.length).toBeGreaterThan(1);
    expect(new Set(droidEvidence.map((evidence) => evidence.sourceSlug))).toEqual(
      new Set(["droid-project"]),
    );
    expect(new Set(droidEvidence.map((evidence) => evidence.sourceIdentity))).toEqual(
      new Set(["DROID Dataset Team"]),
    );
  });

  it("validates source-map status and normalizes pipeline coverage", () => {
    expect(SourceMapStatusSchema.options).toEqual([
      "integrated",
      "pending",
      "restricted",
      "substitute",
    ]);
    expect(
      SourcePipelineCoverageSchema.parse([
        "multimodal-capture",
        "multimodal-capture",
        "quality-training-feedback",
      ]),
    ).toEqual(["multimodal-capture", "quality-training-feedback"]);
  });

  it("persists governance fields and gives restored legacy rows safe defaults", async () => {
    const db = await setup();
    const sourceTable = (await db.introspection.getTables()).find(
      (table) => table.name === "sources",
    );
    for (const name of ["owner", "robots_policy", "freshness_slo_hours", "adapter_version"]) {
      expect(sourceTable?.columns.find((column) => column.name === name)).toMatchObject({
        isNullable: false,
        hasDefaultValue: true,
      });
    }
    for (const name of [
      "map_status",
      "pipeline_stages_json",
      "substitute_for_json",
      "restriction_note",
    ]) {
      expect(sourceTable?.columns.find((column) => column.name === name)).toMatchObject({
        isNullable: false,
        hasDefaultValue: true,
      });
    }

    await db
      .insertInto("sources")
      .values({
        id: "legacy-source",
        slug: "legacy-source",
        name: "Legacy Source",
        homepage_url: "https://example.com",
        adapter: "rss",
        tier: 2,
        role: "research",
        region: "GLOBAL",
        language: "en",
        authority_score: 70,
        enabled: 0,
        config_json: JSON.stringify({ url: "https://example.com/feed.xml" }),
        state_json: "{}",
        last_collected_at: null,
        last_success_at: null,
        last_error: null,
        created_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T00:00:00.000Z",
      })
      .execute();

    expect(
      await db
        .selectFrom("sources")
        .select([
          "owner",
          "robots_policy",
          "freshness_slo_hours",
          "adapter_version",
          "map_status",
          "pipeline_stages_json",
          "substitute_for_json",
          "restriction_note",
        ])
        .where("id", "=", "legacy-source")
        .executeTakeFirstOrThrow(),
    ).toEqual({
      owner: "Unknown owner",
      robots_policy: "Review required",
      freshness_slo_hours: 168,
      adapter_version: "1",
      map_status: "pending",
      pipeline_stages_json: "[]",
      substitute_for_json: "[]",
      restriction_note: "",
    });
  });

  it("updates catalog-owned source-map fields without changing operational state", async () => {
    const db = await setup(true);
    const repository = new Repository(db);
    const source = (await repository.listSources()).find(
      (candidate) => candidate.content_scope === "embodied-data",
    );
    expect(source).toBeDefined();
    if (!source) throw new Error("Missing seeded embodied source");

    await repository.updateSource(source.id, {
      observation_enabled: 1,
      state_json: JSON.stringify({ cursor: "preserve-me" }),
      lifecycle_status: "shadow",
      consecutive_failures: 2,
      success_count: 11,
      failure_count: 3,
    });
    const operational = await repository.getSource(source.id);
    if (!operational) throw new Error("Missing source after operational update");
    const { created_at, updated_at, ...catalogSource } = operational;

    await repository.saveCatalogSource({
      ...catalogSource,
      name: "Updated catalog source",
      map_status: "restricted",
      pipeline_stages_json: JSON.stringify(["multimodal-capture"]),
      substitute_for_json: JSON.stringify(["fallback-source"]),
      restriction_note: "Manual access only.",
    });

    expect(await repository.getSource(source.id)).toMatchObject({
      name: "Updated catalog source",
      map_status: "restricted",
      pipeline_stages_json: JSON.stringify(["multimodal-capture"]),
      substitute_for_json: JSON.stringify(["fallback-source"]),
      restriction_note: "Manual access only.",
      observation_enabled: 1,
      state_json: JSON.stringify({ cursor: "preserve-me" }),
      lifecycle_status: "shadow",
      consecutive_failures: 2,
      success_count: 11,
      failure_count: 3,
    });
  });

  it("seeds governed embodied sources and keeps legacy sources retired", async () => {
    const db = await setup(true);
    const sources = await new Repository(db).listSources();
    const current = sources.filter((source) => source.content_scope === "embodied-data");
    const legacy = sources.filter((source) => source.content_scope === "legacy-ai");

    expect(current.length).toBeGreaterThanOrEqual(30);
    expect(current.find((source) => source.slug === "droid-project")).toMatchObject({
      map_status: "pending",
      pipeline_stages_json: JSON.stringify([
        "acquisition-route",
        "production-operations",
        "quality-training-feedback",
      ]),
    });
    expect(current.find((source) => source.slug === "samr-standards")).toMatchObject({
      map_status: "substitute",
      substitute_for_json: JSON.stringify(["cesi-embodied-standards"]),
      lifecycle_status: "draft",
      adapter: "web-scraper",
      enabled: 0,
      observation_enabled: 0,
    });
    expect(current.find((source) => source.slug === "cesi-embodied-standards")).toMatchObject({
      map_status: "restricted",
      restriction_note:
        "Official site returned a JavaScript cloud-protection challenge; do not bypass it.",
    });
    for (const source of current)
      expect(
        SourcePipelineCoverageSchema.parse(JSON.parse(source.pipeline_stages_json)).length,
      ).toBeGreaterThan(0);
    expect(
      current.every(
        (source) =>
          ["draft", "shadow"].includes(source.lifecycle_status) &&
          source.owner.length > 1 &&
          source.robots_policy.length > 10 &&
          source.freshness_slo_hours > 0 &&
          /^\d+$/.test(source.adapter_version),
      ),
    ).toBe(true);
    expect(legacy.length).toBeGreaterThan(0);
    expect(
      legacy.every(
        (source) =>
          source.enabled === 0 &&
          source.observation_enabled === 0 &&
          source.lifecycle_status === "retired" &&
          source.maintenance_status === "retired",
      ),
    ).toBe(true);
  });

  it("soft-retires stale sources without deleting run or check history", async () => {
    const db = await setup(true);
    const repository = new Repository(db);
    await db
      .insertInto("sources")
      .values({
        id: "stale-source-id",
        slug: "stale-generic-ai",
        name: "Stale Generic AI",
        homepage_url: "https://example.com/stale",
        adapter: "rss",
        tier: 2,
        role: "research",
        region: "GLOBAL",
        language: "en",
        authority_score: 60,
        enabled: 1,
        observation_enabled: 1,
        config_json: JSON.stringify({ url: "https://example.com/stale/feed.xml" }),
        state_json: "{}",
        last_collected_at: null,
        last_success_at: null,
        last_error: null,
        lifecycle_status: "active",
        content_scope: "legacy-ai",
        created_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T00:00:00.000Z",
      })
      .execute();
    const jobId = await repository.startJob("collect", "stale-source-id");
    const runId = await repository.startSourceRun("stale-source-id", jobId);
    await repository.finishSourceRun(runId, {
      status: "succeeded",
      attemptCount: 1,
      durationMs: 10,
      collected: 1,
      created: 1,
      skipped: 0,
      httpStatus: 200,
      responseBytes: 100,
    });
    await repository.insertSourceCheck({
      id: "stale-check",
      source_id: "stale-source-id",
      job_id: jobId,
      status: "healthy",
      adapter: "rss",
      adapter_version: "1",
      access_status: "reachable",
      fetch_status: "succeeded",
      parse_status: "succeeded",
      schema_status: "valid",
      policy_status: "allowed_metadata",
      http_status: 200,
      final_url: "https://example.com/feed.xml",
      content_type: "application/rss+xml",
      response_bytes: 100,
      item_count: 1,
      duplicate_count: 0,
      duplicate_ratio_bps: 0,
      quality_score: 90,
      latest_item_at: "2026-09-20T00:00:00.000Z",
      freshness_hours: 1,
      error_type: null,
      error_code: null,
      error_summary: null,
      repair_action: "none",
      proxy_hint: "not_required",
      proxy_used: 0,
      retention_decision: "keep",
      recommended_lifecycle: "shadow",
      sample_json: "{}",
      started_at: "2026-09-20T00:00:00.000Z",
      finished_at: "2026-09-20T00:00:01.000Z",
      duration_ms: 1000,
    });

    await seedDatabase(db);

    expect(await repository.getSource("stale-source-id")).toMatchObject({
      slug: "stale-generic-ai",
      enabled: 0,
      observation_enabled: 0,
      lifecycle_status: "retired",
      maintenance_status: "retired",
      content_scope: "legacy-ai",
    });
    expect((await repository.listSourceRuns("stale-source-id")).length).toBe(1);
    expect((await repository.listSourceChecks("stale-source-id")).length).toBe(1);
  });
});
