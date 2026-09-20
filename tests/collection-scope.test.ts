import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  isCurrentEmbodiedSource,
  parseCollectionScopeArgument,
  planSourceCollection,
} from "../src/pipeline/collect.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function setup() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return db;
}

function crossScopeItem(slug: string) {
  return {
    url: `https://example.com/shared/${slug}`,
    title: "Shared canonical record",
    summary: "The same canonical URL must not cross content scopes during deduplication.",
    language: "en",
    publishedAt: "2026-09-20T00:00:00.000Z",
    category: "research",
    tags: ["scope-boundary"],
    metrics: {},
    rawMeta: {},
  };
}

describe("collection scope", () => {
  it.each([
    [undefined, "eligible"],
    ["eligible", "eligible"],
    ["embodied-data", "eligible"],
    ["all", "all"],
  ] as const)("maps CLI scope %s to %s", (argument, expected) => {
    expect(parseCollectionScopeArgument(argument)).toBe(expected);
  });

  it("rejects unknown collection scopes", () => {
    expect(() => parseCollectionScopeArgument("legacy-ai")).toThrow(
      /eligible, embodied-data, or all/,
    );
  });

  it("inherits the source content scope when a signal is collected", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const source = (await repository.listSources()).find(
      (candidate) => candidate.slug === "physical-intelligence",
    );
    if (!source) throw new Error("Missing embodied source fixture");

    const signal = await repository.insertSignal(source.id, {
      url: "https://www.physicalintelligence.company/blog/scope-propagation-fixture",
      title: "Physical Intelligence releases a robot dataset benchmark",
      summary:
        "The release adds a robot demonstration dataset, collection metadata, and a repeatable quality benchmark.",
      language: "en",
      publishedAt: "2026-09-20T00:00:00.000Z",
      category: "research",
      tags: ["robot-data", "dataset"],
      metrics: {},
      rawMeta: {},
    });

    expect(signal?.content_scope).toBe("embodied-data");
  });

  it("promotes a legacy canonical URL when an embodied source takes ownership", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const sources = await repository.listSources();
    const legacy = sources.find(
      (source) =>
        source.content_scope === "legacy-ai" &&
        source.role !== "aggregator" &&
        source.source_category !== "aggregator",
    );
    const embodied = sources.find((source) => source.content_scope === "embodied-data");
    if (!legacy || !embodied) throw new Error("Missing cross-scope source fixtures");
    const item = {
      url: "https://example.com/shared/canonical-record",
      title: "Shared canonical record",
      summary: "The same canonical URL must not cross content scopes during deduplication.",
      language: "en",
      publishedAt: "2026-09-20T00:00:00.000Z",
      category: "research",
      tags: ["scope-boundary"],
      metrics: {},
      rawMeta: {},
    };

    await repository.insertSignal(legacy.id, item);

    await repository.insertSignal(embodied.id, item);
    const stored = await db
      .selectFrom("signals")
      .select(["content_scope", "source_id"])
      .where("canonical_url", "=", item.url)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ content_scope: "embodied-data", source_id: embodied.id });
    const observations = await db
      .selectFrom("signal_observations")
      .select("source_id")
      .where(
        "signal_id",
        "=",
        (
          await db
            .selectFrom("signals")
            .select("id")
            .where("canonical_url", "=", item.url)
            .executeTakeFirstOrThrow()
        ).id,
      )
      .execute();
    expect(new Set(observations.map((observation) => observation.source_id))).toEqual(
      new Set([legacy.id, embodied.id]),
    );
  });

  it("does not promote a legacy canonical URL that is already attached to an event", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const sources = await repository.listSources();
    const legacy = sources.find(
      (source) =>
        source.content_scope === "legacy-ai" &&
        source.role !== "aggregator" &&
        source.source_category !== "aggregator",
    );
    const embodied = sources.find((source) => source.content_scope === "embodied-data");
    if (!legacy || !embodied) throw new Error("Missing cross-scope source fixtures");
    const item = crossScopeItem("attached-canonical-record");
    const legacySignal = await repository.insertSignal(legacy.id, item);
    if (!legacySignal) throw new Error("Missing legacy signal fixture");
    const timestamp = new Date().toISOString();
    const eventId = "legacy-attached-canonical-event";
    await repository.insertEvent({
      id: eventId,
      slug: eventId,
      title: item.title,
      fact_summary: item.summary,
      summary: item.summary,
      technical_insight: "Legacy technical analysis.",
      industry_insight: "Legacy industry analysis.",
      future_outlook: "Legacy outlook.",
      business_value: "Legacy business analysis.",
      category: item.category,
      company: "Legacy fixture",
      keywords_json: "[]",
      confidence_score: 80,
      heat_score: 0,
      impact_score: 70,
      value_score: 70,
      score_factors_json: "{}",
      status: "review",
      featured: 0,
      manual_override: 0,
      happened_at: item.publishedAt,
      published_at: null,
      readiness_blockers_json: "[]",
      content_scope: "legacy-ai",
      created_at: timestamp,
      updated_at: timestamp,
    });
    await repository.attachSignal(eventId, legacySignal.id, "supporting", 100);

    await expect(repository.insertSignal(embodied.id, item)).resolves.toBeUndefined();

    const stored = await db
      .selectFrom("signals")
      .select(["content_scope", "source_id"])
      .where("id", "=", legacySignal.id)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ content_scope: "legacy-ai", source_id: legacy.id });
    expect(
      await db
        .selectFrom("signal_observations")
        .select("source_id")
        .where("signal_id", "=", legacySignal.id)
        .execute(),
    ).toEqual([{ source_id: legacy.id }]);
  });

  it("does not promote a legacy canonical URL that is already deferred", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const sources = await repository.listSources();
    const legacy = sources.find(
      (source) =>
        source.content_scope === "legacy-ai" &&
        source.role !== "aggregator" &&
        source.source_category !== "aggregator",
    );
    const embodied = sources.find((source) => source.content_scope === "embodied-data");
    if (!legacy || !embodied) throw new Error("Missing cross-scope source fixtures");
    const item = crossScopeItem("deferred-canonical-record");
    const legacySignal = await repository.insertSignal(legacy.id, item);
    if (!legacySignal) throw new Error("Missing legacy signal fixture");
    await repository.deferSignal(legacySignal.id, "legacy_scope_fixture", 10, {});

    await expect(repository.insertSignal(embodied.id, item)).resolves.toBeUndefined();

    const stored = await db
      .selectFrom("signals")
      .select(["content_scope", "source_id"])
      .where("id", "=", legacySignal.id)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ content_scope: "legacy-ai", source_id: legacy.id });
    expect(
      await db
        .selectFrom("signal_observations")
        .select("source_id")
        .where("signal_id", "=", legacySignal.id)
        .execute(),
    ).toEqual([{ source_id: legacy.id }]);
  });

  it("ignores attempts to demote an embodied canonical URL into legacy scope", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const sources = await repository.listSources();
    const legacy = sources.find(
      (source) =>
        source.content_scope === "legacy-ai" &&
        source.role !== "aggregator" &&
        source.source_category !== "aggregator",
    );
    const embodied = sources.find((source) => source.content_scope === "embodied-data");
    if (!legacy || !embodied) throw new Error("Missing cross-scope source fixtures");
    const item = {
      url: "https://example.com/embodied/canonical-record",
      title: "Embodied canonical record",
      summary: "An embodied canonical URL must not be demoted by a legacy source.",
      language: "en",
      publishedAt: "2026-09-20T00:00:00.000Z",
      category: "research",
      tags: ["scope-boundary"],
      metrics: {},
      rawMeta: {},
    };

    await repository.insertSignal(embodied.id, item);
    await expect(repository.insertSignal(legacy.id, item)).resolves.toBeUndefined();
    const stored = await db
      .selectFrom("signals")
      .select(["content_scope", "source_id"])
      .where("canonical_url", "=", item.url)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ content_scope: "embodied-data", source_id: embodied.id });
  });

  it("selects only observed embodied shadow sources by default", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const [selected, unobserved] = (await repository.listSources())
      .filter(isCurrentEmbodiedSource)
      .filter((source) => source.lifecycle_status === "shadow" && source.adapter !== "manual")
      .slice(0, 2);
    if (!selected || !unobserved) throw new Error("Missing source fixtures");
    await repository.updateSource(selected.id, { observation_enabled: 1 });

    const sources = await repository.listSources();
    const plan = planSourceCollection(sources, "eligible", false);

    expect(plan.sources.map((source) => source.slug)).toEqual([selected.slug]);
    expect(plan.sources.every(isCurrentEmbodiedSource)).toBe(true);
    expect(plan.summary.skippedByReason.not_enabled).toBe(
      sources.filter(
        (source) => isCurrentEmbodiedSource(source) && source.lifecycle_status === "shadow",
      ).length - 1,
    );
    const manualSources = sources.filter(
      (source) => isCurrentEmbodiedSource(source) && source.adapter === "manual",
    );
    expect(manualSources.length).toBeGreaterThan(0);
    expect(planSourceCollection(manualSources, "all", true).sources).toEqual([]);
    expect(plan.summary.skippedByReason["lifecycle:draft"]).toBe(manualSources.length);
  });

  it("never collects legacy or retired sources even in diagnostic scope", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const [legacy, retired] = (await repository.listSources())
      .filter(isCurrentEmbodiedSource)
      .slice(0, 2);
    if (!legacy || !retired) throw new Error("Missing source fixtures");
    await repository.updateSource(legacy.id, {
      content_scope: "legacy-ai",
      enabled: 1,
      lifecycle_status: "active",
    });
    await repository.updateSource(retired.id, {
      lifecycle_status: "retired",
      observation_enabled: 1,
    });

    const plan = planSourceCollection(await repository.listSources(), "all", true);

    expect(plan.sources.some((source) => source.id === legacy.id)).toBe(false);
    expect(plan.sources.some((source) => source.id === retired.id)).toBe(false);
    expect(plan.summary.skippedByReason["scope:legacy-ai"]).toBeGreaterThan(0);
    expect(plan.summary.skippedByReason["lifecycle:retired"]).toBe(1);
  });
});
