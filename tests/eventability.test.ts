import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { clusterSignals } from "../src/pipeline/cluster.js";

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
  return { db, repository: new Repository(db) };
}

describe("signal eventability triage", () => {
  it("clusters signals and deferred evidence only within the same content scope", async () => {
    const { db, repository } = await setup();
    const sources = await repository.listSources();
    const embodiedSource = sources.find((item) => item.slug === "physical-intelligence");
    const legacySource = sources.find((item) => item.slug === "openai");
    if (!embodiedSource || !legacySource) throw new Error("Missing source fixtures");
    await repository.updateSource(embodiedSource.id, {
      lifecycle_status: "active",
      enabled: 1,
    });

    const title = "Physical Intelligence releases a scoped robot dataset benchmark";
    const summary =
      "The release adds robot demonstration data, collection metadata, and a repeatable quality benchmark for embodied data production.";
    const publishedAt = "2026-09-20T00:00:00.000Z";
    const legacySignal = await repository.insertSignal(legacySource.id, {
      url: "https://openai.com/index/legacy-scope-cluster-fixture/",
      title,
      summary,
      language: "en",
      publishedAt,
      category: "research",
      tags: ["robot-data", "dataset"],
      metrics: {},
      rawMeta: { quality: { score: 90 } },
    });
    if (!legacySignal) throw new Error("Missing legacy signal fixture");
    await repository.deferSignal(legacySignal.id, "scope_isolation_fixture", 100, {});

    const legacyEventId = "legacy-scope-event-fixture";
    const timestamp = new Date().toISOString();
    await db
      .insertInto("events")
      .values({
        id: legacyEventId,
        slug: "legacy-scope-event-fixture",
        title,
        fact_summary: summary,
        summary,
        technical_insight: "Legacy technical analysis for the scope isolation fixture.",
        industry_insight: "Legacy industry analysis for the scope isolation fixture.",
        future_outlook: "Legacy outlook for the scope isolation fixture.",
        business_value: "Legacy business analysis for the scope isolation fixture.",
        category: "research",
        company: "Physical Intelligence",
        keywords_json: '["robot-data","dataset"]',
        confidence_score: 80,
        heat_score: 0,
        impact_score: 70,
        value_score: 70,
        score_factors_json: "{}",
        status: "review",
        featured: 0,
        manual_override: 0,
        happened_at: publishedAt,
        published_at: null,
        readiness_blockers_json: "[]",
        content_scope: "legacy-ai",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    const embodiedSignal = await repository.insertSignal(embodiedSource.id, {
      url: "https://www.physicalintelligence.company/blog/scope-cluster-fixture",
      title,
      summary,
      language: "en",
      publishedAt,
      category: "research",
      tags: ["robot-data", "dataset"],
      metrics: {},
      rawMeta: { quality: { score: 90 } },
    });
    if (!embodiedSignal) throw new Error("Missing embodied signal fixture");

    await clusterSignals(db);

    const embodiedEvent = await db
      .selectFrom("events")
      .select(["id", "content_scope"])
      .where("title", "=", title)
      .where("content_scope", "=", "embodied-data")
      .executeTakeFirst();
    expect(embodiedEvent?.content_scope).toBe("embodied-data");
    expect(
      await db
        .selectFrom("event_signals")
        .select("signal_id")
        .where("event_id", "=", embodiedEvent?.id ?? "missing")
        .orderBy("signal_id")
        .execute(),
    ).toEqual([{ signal_id: embodiedSignal.id }]);
    expect(
      await db
        .selectFrom("event_signals")
        .select("signal_id")
        .where("event_id", "=", legacyEventId)
        .execute(),
    ).toEqual([]);
  });

  it("defers an isolated media commentary instead of creating timeline noise", async () => {
    const { db, repository } = await setup();
    const media = (await repository.listSources()).find((source) => source.slug === "galaxea-ai");
    expect(media).toBeTruthy();
    await repository.updateSource(media?.id ?? "missing", {
      lifecycle_status: "active",
      enabled: 1,
    });
    const inserted = await repository.insertSignal(media?.id ?? "missing", {
      url: "https://techcrunch.com/fixture/opinion-only",
      title: "A broad opinion about the future of AI",
      summary: "Commentary without a concrete release, transaction, policy, or research milestone.",
      language: "en",
      publishedAt: "2026-07-12T00:00:00.000Z",
      category: "industry",
      tags: [],
      metrics: {},
      rawMeta: { quality: { score: 60 } },
    });
    const before = await eventCount(db);

    const result = await clusterSignals(db);

    expect(result).toMatchObject({ created: 0, deferred: 1 });
    expect(await eventCount(db)).toBe(before);
    expect(
      await db
        .selectFrom("signal_triage")
        .select(["status", "reason", "eventability_score"])
        .where("signal_id", "=", inserted?.id ?? "missing")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ status: "deferred", reason: "insufficient_eventability" });
  });

  it("creates a review event for a concrete first-party model launch", async () => {
    const { db, repository } = await setup();
    const source = (await repository.listSources()).find(
      (item) => item.slug === "physical-intelligence",
    );
    await repository.updateSource(source?.id ?? "missing", {
      lifecycle_status: "active",
      enabled: 1,
    });
    await repository.insertSignal(source?.id ?? "missing", {
      url: "https://openai.com/index/fixture-model-launch/",
      title: "OpenAI launches Fixture-1 model",
      summary: "A concrete first-party model launch with product and technical implications.",
      language: "en",
      publishedAt: "2026-07-12T00:00:00.000Z",
      category: "model-release",
      tags: ["model", "release"],
      metrics: {},
      rawMeta: { quality: { score: 80 } },
    });

    const result = await clusterSignals(db);

    expect(result).toMatchObject({ created: 1, deferred: 0 });
    expect(
      (await repository.listEvents("review")).some((event) => event.title.includes("Fixture-1")),
    ).toBe(true);
  });

  it("keeps healthy shadow-source signals in observation until activation", async () => {
    const { db, repository } = await setup();
    const source = (await repository.listSources()).find(
      (item) => item.slug === "nvidia-isaac-lab",
    );
    expect(source?.lifecycle_status).toBe("shadow");
    const inserted = await repository.insertSignal(source?.id ?? "missing", {
      url: "https://machinelearning.apple.com/research/fixture-observation",
      title: "Apple releases Fixture Observation model",
      summary: "A concrete official release that remains non-production during shadow observation.",
      language: "en",
      publishedAt: "2026-07-12T01:00:00.000Z",
      category: "model-release",
      tags: ["model", "release"],
      metrics: {},
      rawMeta: { quality: { score: 90 } },
    });
    const before = await eventCount(db);

    const result = await clusterSignals(db);

    expect(result).toMatchObject({ created: 0, deferred: 1 });
    expect(await eventCount(db)).toBe(before);
    expect(
      await db
        .selectFrom("signal_triage")
        .select("reason")
        .where("signal_id", "=", inserted?.id ?? "missing")
        .executeTakeFirstOrThrow(),
    ).toEqual({ reason: "shadow_observation" });
  });

  it("creates a review event for a decision-relevant research contribution", async () => {
    const { db, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "droid-project");
    await repository.updateSource(source?.id ?? "missing", {
      lifecycle_status: "active",
      enabled: 1,
    });
    expect((await repository.getSource(source?.id ?? "missing"))?.lifecycle_status).toBe("active");
    await repository.insertSignal(source?.id ?? "missing", {
      url: "https://arxiv.org/abs/2607.99991",
      title: "FixtureLongBench: A benchmark for difficulty-aware long-context reasoning",
      summary:
        "This paper introduces a benchmark and controlled evaluation method for long-context reasoning in large language models. It varies retrieval difficulty, reasoning depth, and context length independently, then evaluates multiple frontier systems with reproducible artifacts. The study finds that accuracy degrades sharply as difficulty rises even when the relevant evidence remains inside the context window, which changes how teams should assess models for high-stakes document and agent workflows.",
      language: "en",
      publishedAt: "2026-07-12T00:00:00.000Z",
      category: "research",
      tags: ["benchmark", "long-context", "reasoning"],
      metrics: {},
      rawMeta: { quality: { score: 88 } },
    });

    const result = await clusterSignals(db);

    expect(result).toMatchObject({ created: 1, deferred: 0 });
    expect(
      (await repository.listEvents("review")).some((event) =>
        event.title.includes("FixtureLongBench"),
      ),
    ).toBe(true);
  });

  it("defers a thin research listing without a clear contribution", async () => {
    const { db, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "arxiv-ai");
    await repository.insertSignal(source?.id ?? "missing", {
      url: "https://arxiv.org/abs/2607.99992",
      title: "Some observations about intelligent systems",
      summary: "A short abstract without enough method, evidence, or decision context.",
      language: "en",
      publishedAt: "2026-07-12T00:00:00.000Z",
      category: "research",
      tags: [],
      metrics: {},
      rawMeta: { quality: { score: 90 } },
    });

    await expect(clusterSignals(db)).resolves.toMatchObject({ created: 0, deferred: 1 });
  });

  it("admits a concise but concrete research abstract into review", async () => {
    const { db, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "arxiv-ai");
    const summary =
      "This paper introduces a benchmark for tool-using language model agents. It evaluates planning, recovery, and grounded action across reproducible tasks, and reports where current agents fail under delayed feedback and limited context.";
    expect(summary.length).toBeGreaterThanOrEqual(160);
    expect(summary.length).toBeLessThan(240);
    await repository.insertSignal(source?.id ?? "missing", {
      url: "https://arxiv.org/abs/2607.99993",
      title: "FixtureAgentBench: Evaluating tool-using language model agents",
      summary,
      language: "en",
      publishedAt: "2026-07-12T00:00:00.000Z",
      category: "research",
      tags: ["benchmark", "agent"],
      metrics: {},
      rawMeta: { quality: { score: 82 } },
    });

    await expect(clusterSignals(db)).resolves.toMatchObject({ created: 1, deferred: 0 });
  });
});

async function eventCount(db: ReturnType<typeof createDatabase>): Promise<number> {
  const row = await db
    .selectFrom("events")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
