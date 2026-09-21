import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import {
  reconcileSourcePortfolio,
  triageSourceRadar,
} from "../src/pipeline/autonomous-operations.js";

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

describe("autonomous quality operations", () => {
  it("matches known source discoveries and creates only disabled draft proposals", async () => {
    const { db, repository } = await setup();
    const sources = await repository.listSources();
    const aggregator = sources.find((source) => source.source_category === "aggregator");
    const roots = sources
      .filter((source) => source.source_category !== "aggregator")
      .map((source) => new URL(source.homepage_url).hostname.replace(/^www\./, ""));
    const known = sources.find((source) => {
      if (source.source_category === "aggregator") return false;
      const host = new URL(source.homepage_url).hostname.replace(/^www\./, "");
      return roots.filter((value) => value === host).length === 1;
    });
    expect(aggregator).toBeTruthy();
    expect(known).toBeTruthy();
    const now = new Date().toISOString();
    await addDiscovery(
      db,
      aggregator?.id ?? "missing",
      new URL("automated-discovery", known?.homepage_url).toString(),
      now,
    );
    await addDiscovery(db, aggregator?.id ?? "missing", "https://newautolab.example/a", now);
    await addDiscovery(db, aggregator?.id ?? "missing", "https://newautolab.example/b", now);

    const result = await triageSourceRadar(db);

    expect(result.matched).toBeGreaterThanOrEqual(1);
    expect(result.proposalsCreated).toBe(1);
    const proposal = await db
      .selectFrom("sources")
      .selectAll()
      .where("homepage_url", "=", "https://newautolab.example")
      .executeTakeFirstOrThrow();
    expect(proposal).toMatchObject({ lifecycle_status: "draft", enabled: 0 });
    expect(
      await db
        .selectFrom("source_discoveries")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("status", "=", "candidate")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: 2 });
  });

  it("removes aggregator-only clues without first-party identity from the pending queue", async () => {
    const { db, repository } = await setup();
    const aggregator = (await repository.listSources()).find(
      (source) => source.source_category === "aggregator",
    );
    const now = new Date().toISOString();
    const id = randomUUID();
    await db
      .insertInto("source_discoveries")
      .values({
        id,
        identity_hash: `identity-${id}`,
        aggregator_source_id: aggregator?.id ?? "missing",
        external_id: id,
        discovery_url: `https://aggregator.example/${id}`,
        discovery_url_hash: `discovery-${id}`,
        origin_url: null,
        origin_url_hash: null,
        origin_kind: "aggregator_story",
        origin_name: null,
        handles_json: "[]",
        title: "Aggregator-only clue",
        summary: "No first-party identity is available.",
        language: "en",
        published_at: now,
        category: "model",
        tags_json: "[]",
        metrics_json: "{}",
        raw_meta_json: "{}",
        matched_source_id: null,
        candidate_source_ids_json: "[]",
        matched_signal_id: null,
        status: "pending",
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const result = await triageSourceRadar(db);

    expect(result.insufficientIdentity).toBe(1);
    expect(
      await db
        .selectFrom("source_discoveries")
        .select("status")
        .where("id", "=", id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "insufficient_identity" });
  });

  it("degrades and quarantines production sources from consecutive audit evidence", async () => {
    const { db, repository } = await setup();
    const sources = await repository.listSources();
    const currentSources = sources.filter((source) => source.content_scope === "embodied-data");
    const active = currentSources[0];
    const degraded = currentSources[1];
    const shadow = currentSources[2];
    expect(active).toBeTruthy();
    expect(degraded).toBeTruthy();
    expect(shadow).toBeTruthy();
    await repository.updateSource(active?.id ?? "missing", {
      lifecycle_status: "active",
      enabled: 1,
    });
    await repository.updateSource(degraded?.id ?? "missing", {
      lifecycle_status: "degraded",
      enabled: 1,
    });
    await repository.updateSource(shadow?.id ?? "missing", {
      lifecycle_status: "shadow",
      enabled: 0,
      observation_enabled: 1,
    });
    await addFailedChecks(db, active?.id ?? "missing", 2);
    await addFailedChecks(db, degraded?.id ?? "missing", 5);
    await addFailedChecks(db, shadow?.id ?? "missing", 5);

    const result = await reconcileSourcePortfolio(db);

    expect(result.degraded).toContain(active?.slug);
    expect(result.quarantined).toContain(degraded?.slug);
    expect(result.quarantined).not.toContain(shadow?.slug);
    expect(await repository.getSource(active?.id ?? "missing")).toMatchObject({
      lifecycle_status: "degraded",
      enabled: 1,
    });
    expect(await repository.getSource(degraded?.id ?? "missing")).toMatchObject({
      lifecycle_status: "quarantined",
      enabled: 0,
    });
    expect(await repository.getSource(shadow?.id ?? "missing")).toMatchObject({
      lifecycle_status: "shadow",
      enabled: 0,
      observation_enabled: 0,
    });
  });
});

async function addDiscovery(
  db: ReturnType<typeof createDatabase>,
  aggregatorSourceId: string,
  originUrl: string,
  timestamp: string,
) {
  const id = randomUUID();
  await db
    .insertInto("source_discoveries")
    .values({
      id,
      identity_hash: `identity-${id}`,
      aggregator_source_id: aggregatorSourceId,
      external_id: id,
      discovery_url: `https://aggregator.example/${id}`,
      discovery_url_hash: `discovery-${id}`,
      origin_url: originUrl,
      origin_url_hash: `origin-${id}`,
      origin_kind: "official",
      origin_name: null,
      handles_json: "[]",
      title: `Discovery ${id}`,
      summary: "First-party source discovery.",
      language: "en",
      published_at: timestamp,
      category: "model",
      tags_json: "[]",
      metrics_json: "{}",
      raw_meta_json: "{}",
      matched_source_id: null,
      candidate_source_ids_json: "[]",
      matched_signal_id: null,
      status: "pending",
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
}

async function addFailedChecks(
  db: ReturnType<typeof createDatabase>,
  sourceId: string,
  count: number,
) {
  for (let index = 0; index < count; index++) {
    const timestamp = new Date(Date.now() - index * 60_000).toISOString();
    await db
      .insertInto("source_checks")
      .values({
        id: randomUUID(),
        source_id: sourceId,
        job_id: null,
        status: "failed",
        adapter: "rss",
        adapter_version: "1",
        access_status: "reachable",
        fetch_status: "failed",
        parse_status: "failed",
        schema_status: "unknown",
        policy_status: "allowed_metadata",
        http_status: 500,
        final_url: null,
        content_type: null,
        response_bytes: 0,
        item_count: 0,
        duplicate_count: 0,
        duplicate_ratio_bps: 0,
        quality_score: 0,
        latest_item_at: null,
        freshness_hours: null,
        error_type: "http",
        error_code: "HTTP_500",
        error_summary: "test",
        repair_action: "retry",
        proxy_hint: "not_required",
        proxy_used: 0,
        retention_decision: "observe",
        recommended_lifecycle: "shadow",
        sample_json: "[]",
        started_at: timestamp,
        finished_at: timestamp,
        duration_ms: 1,
      })
      .execute();
  }
}
