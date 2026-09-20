import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { restoreRepositorySnapshot, writeRepositorySnapshot } from "../src/pipeline/snapshot.js";
import profiles from "./fixtures/embodied-data/data-profiles.json" with { type: "json" };
import actorCapabilities from "./fixtures/embodied-data/objects/actor-capabilities.json" with {
  type: "json",
};
import collectionMethods from "./fixtures/embodied-data/objects/collection-methods.json" with {
  type: "json",
};
import datasets from "./fixtures/embodied-data/objects/datasets.json" with { type: "json" };
import standards from "./fixtures/embodied-data/objects/standards.json" with { type: "json" };

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

describe("repository data snapshot", () => {
  it("is deterministic, strips sensitive URL parameters and restores into a fresh database", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const sourceDb = createDatabase(config);
    databases.push(sourceDb);
    await migrateToLatest(sourceDb, config);
    await seedDatabase(sourceDb);
    await sourceDb
      .insertInto("evaluation_runs")
      .values({
        id: "snapshot-evaluation-run",
        release_version: "test",
        status: "partial",
        overall_score: 51,
        dimensions_json: JSON.stringify([{ slug: "coverage", score: 51, tokenCount: 42 }]),
        capability_snapshot_json: JSON.stringify([{ slug: "snapshot", status: "operational" }]),
        notes: "Measured evidence only.",
        evaluation_as_of: "2026-07-11T07:58:00.000Z",
        gate_mode: "change",
        started_at: "2026-07-11T07:59:00.000Z",
        finished_at: "2026-07-11T08:00:00.000Z",
      })
      .execute();
    const repository = new Repository(sourceDb);
    const openai = (await repository.listSources()).find((source) => source.slug === "openai");
    expect(openai).toBeDefined();
    await repository.updateSource(openai?.id ?? "", { content_scope: "embodied-data" });
    const profiledEvent = await sourceDb
      .selectFrom("events")
      .select(["id", "slug"])
      .where("slug", "=", "lingbot-vla-2-cross-embodiment")
      .executeTakeFirstOrThrow();
    await repository.updateEvent(profiledEvent.id, { content_scope: "embodied-data" });
    await repository.upsertEventDataProfile(profiledEvent.id, profiles.valid[0]);
    const datasetFixture = datasets[0];
    const standardFixture = standards[0];
    const methodFixture = collectionMethods[0];
    const capabilityFixture = actorCapabilities[0];
    if (!datasetFixture || !standardFixture || !methodFixture || !capabilityFixture) {
      throw new Error("Missing embodied object fixture");
    }
    const datasetId = await repository.upsertDataset(datasetFixture.slug, datasetFixture.profile);
    const standardId = await repository.upsertStandard(
      standardFixture.slug,
      standardFixture.profile,
    );
    const methodId = await repository.upsertCollectionMethod(
      methodFixture.slug,
      methodFixture.profile,
    );
    await repository.linkDatasetEvent(datasetId, profiledEvent.id, "release");
    await repository.linkStandardEvent(standardId, profiledEvent.id, "publication");
    await repository.linkCollectionMethodEvent(methodId, profiledEvent.id, "demonstration");
    const capabilityActor = await sourceDb
      .selectFrom("actors")
      .select(["id", "slug"])
      .where("slug", "=", "openai")
      .executeTakeFirstOrThrow();
    const capabilityId = await repository.upsertActorDataCapability(
      capabilityActor.id,
      capabilityFixture,
    );
    await repository.linkActorCapabilityEvidence(capabilityId, profiledEvent.id, "claim");
    const jobId = await repository.startJob("collect", openai?.id ?? null);
    const runId = await repository.startSourceRun(openai?.id ?? "", jobId);
    await repository.finishSourceRun(runId, {
      status: "succeeded",
      attemptCount: 1,
      durationMs: 100,
      collected: 10,
      created: 8,
      skipped: 2,
      httpStatus: 200,
      responseBytes: 1_024,
    });
    const secondRunId = await repository.startSourceRun(openai?.id ?? "", jobId);
    await repository.finishSourceRun(secondRunId, {
      status: "not_modified",
      attemptCount: 1,
      durationMs: 50,
      collected: 0,
      created: 0,
      skipped: 0,
      httpStatus: 304,
      responseBytes: 0,
    });
    await repository.finishJob(jobId, { collected: 10, created: 8, skipped: 2, errors: [] });
    await repository.insertSourceCheck({
      id: "snapshot-source-check",
      source_id: openai?.id ?? "",
      job_id: null,
      status: "healthy",
      adapter: "rss",
      adapter_version: "1",
      access_status: "reachable",
      fetch_status: "succeeded",
      parse_status: "succeeded",
      schema_status: "valid",
      policy_status: "allowed_metadata",
      http_status: 200,
      final_url: "https://openai.com/feed.xml?api_key=must-not-leak",
      content_type: "application/atom+xml",
      response_bytes: 1_024,
      item_count: 10,
      duplicate_count: 1,
      duplicate_ratio_bps: 1_000,
      quality_score: 80,
      latest_item_at: "2026-07-11T08:00:00.000Z",
      freshness_hours: 12,
      error_type: null,
      error_code: null,
      error_summary: null,
      repair_action: "none",
      proxy_hint: "not_required",
      proxy_used: 0,
      retention_decision: "keep",
      recommended_lifecycle: "active",
      sample_json: JSON.stringify({ secret: "must-not-leak" }),
      started_at: "2026-07-11T08:00:00.000Z",
      finished_at: "2026-07-11T08:00:01.000Z",
      duration_ms: 1_000,
    });
    const snapshotSignal = await repository.insertSignal(openai?.id ?? "", {
      externalId: "snapshot-sensitive-url",
      url: "https://openai.com/index/snapshot-test?api_key=must-not-leak&utm_source=test",
      title: "Snapshot persistence test signal",
      summary: `A stable signal used to validate repository snapshot restore from /Users/alice/private/workspace. ${"context ".repeat(400)}`,
      language: "en",
      publishedAt: "2026-07-11T08:00:00.000Z",
      category: "test",
      tags: ["snapshot"],
      metrics: { platforms: ["official"] },
      rawMeta: { ignored: true },
    });
    await repository.insertSignal(openai?.id ?? "", {
      externalId: "snapshot-repeat-observation",
      url: "https://openai.com/index/snapshot-test",
      title: "Snapshot persistence test signal",
      summary: "The source observed the canonical item again.",
      language: "en",
      publishedAt: "2026-07-11T08:00:00.000Z",
      category: "test",
      tags: ["repeat"],
      metrics: {},
      rawMeta: {},
    });
    const deepmind = (await repository.listSources()).find((source) => source.slug === "deepmind");
    await repository.insertSignal(deepmind?.id ?? "", {
      externalId: "snapshot-second-observation",
      url: "https://openai.com/index/snapshot-test?utm_medium=syndication",
      title: "Snapshot persistence test signal",
      summary: "The same canonical item was independently observed by another source.",
      language: "en",
      publishedAt: "2026-07-11T08:00:00.000Z",
      category: "test",
      tags: ["cross-source"],
      metrics: { platforms: ["syndication"] },
      rawMeta: {},
    });
    await repository.deferSignal(snapshotSignal?.id ?? "", "snapshot-triage-fixture", 42, {
      reversible: true,
    });
    await sourceDb
      .updateTable("signals")
      .set({ content_scope: "embodied-data" })
      .where("id", "=", snapshotSignal?.id ?? "")
      .execute();

    const root = await mkdtemp(join(tmpdir(), "agent-pulse-snapshot-"));
    const first = await writeRepositorySnapshot(sourceDb, root);
    const second = await writeRepositorySnapshot(sourceDb, root);
    expect(first.changed).toBe(true);
    expect(second).toMatchObject({ changed: false, sha256: first.sha256 });
    const serialized = await readFile(join(root, "data/snapshot/v1.json"), "utf8");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("raw_meta_json");
    expect(serialized).not.toMatch(/"(?:rawPayload|raw_payload|privateNote|private_note)"\s*:/i);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).toContain("[local-path]");
    expect(serialized).toContain('"tokenCount": 42');
    const snapshot = JSON.parse(serialized);
    const persisted = snapshot.signals.find(
      (signal: { title: string }) => signal.title === "Snapshot persistence test signal",
    );
    expect(persisted.summary.length).toBeLessThanOrEqual(320);
    expect(persisted.contentScope).toBe("embodied-data");
    expect(
      snapshot.sources.find((source: { slug: string }) => source.slug === "openai")?.contentScope,
    ).toBe("embodied-data");
    expect(
      snapshot.events.find((event: { slug: string }) => event.slug === profiledEvent.slug)
        ?.contentScope,
    ).toBe("embodied-data");
    expect(snapshot.eventDataProfiles).toEqual([
      expect.objectContaining({ eventSlug: profiledEvent.slug, profile: profiles.valid[0] }),
    ]);
    expect(snapshot.datasets).toEqual([
      expect.objectContaining({ slug: datasetFixture.slug, profile: datasetFixture.profile }),
    ]);
    expect(snapshot.datasetEvents).toEqual([
      expect.objectContaining({
        datasetSlug: datasetFixture.slug,
        eventSlug: profiledEvent.slug,
        relationRole: "release",
      }),
    ]);
    expect(snapshot.standards).toEqual([
      expect.objectContaining({ slug: standardFixture.slug, profile: standardFixture.profile }),
    ]);
    expect(snapshot.collectionMethods).toEqual([
      expect.objectContaining({ slug: methodFixture.slug, profile: methodFixture.profile }),
    ]);
    expect(snapshot.actorDataCapabilities).toEqual([
      expect.objectContaining({
        actorSlug: capabilityActor.slug,
        capabilityKey: capabilityFixture.capabilityKey,
        profile: capabilityFixture,
      }),
    ]);
    expect(snapshot.actorCapabilityEvidence).toEqual([
      expect.objectContaining({
        actorSlug: capabilityActor.slug,
        capabilityKey: capabilityFixture.capabilityKey,
        eventSlug: profiledEvent.slug,
        evidenceRole: "claim",
      }),
    ]);
    expect(first.counts.signalTriage).toBe(1);
    expect(first.counts.sourceChecks).toBe(1);
    expect(first.counts.sourceRuns).toBe(2);
    expect(first.counts.signalObservations).toBeGreaterThanOrEqual(2);
    expect(first.counts.scoutInsights).toBe(1);
    expect(first.counts.evaluationRuns).toBe(1);

    type ObjectSnapshotFixture = {
      eventDataProfiles: Array<Record<string, unknown>>;
      datasets: Array<Record<string, unknown>>;
      datasetEvents: Array<Record<string, unknown>>;
      standardEvents: Array<Record<string, unknown>>;
      collectionMethodEvents: Array<Record<string, unknown>>;
      actorDataCapabilities: Array<Record<string, unknown>>;
      actorCapabilityEvidence: Array<Record<string, unknown>>;
    };
    const corruptionCases: Array<{
      name: string;
      expected: string;
      mutate(value: ObjectSnapshotFixture): void;
    }> = [
      {
        name: "missing-profile-event",
        expected: "Snapshot Event reference not found",
        mutate: (value) => {
          if (value.eventDataProfiles[0]) {
            value.eventDataProfiles[0].eventSlug = "missing-profile-event";
          }
        },
      },
      {
        name: "unsupported-profile-version",
        expected: "Unsupported embodied data profile schema version: 2",
        mutate: (value) => {
          if (value.eventDataProfiles[0]) value.eventDataProfiles[0].schemaVersion = 2;
        },
      },
      {
        name: "invalid-profile-updated-at",
        expected: "Snapshot field updatedAt must be an ISO timestamp",
        mutate: (value) => {
          if (value.eventDataProfiles[0]) value.eventDataProfiles[0].updatedAt = "zzzz";
        },
      },
      {
        name: "missing-dataset",
        expected: "Snapshot Dataset reference not found",
        mutate: (value) => {
          if (value.datasetEvents[0]) value.datasetEvents[0].datasetSlug = "missing-dataset";
        },
      },
      {
        name: "missing-event",
        expected: "Snapshot Event reference not found",
        mutate: (value) => {
          if (value.datasetEvents[0]) value.datasetEvents[0].eventSlug = "missing-event";
        },
      },
      {
        name: "missing-standard",
        expected: "Snapshot Standard reference not found",
        mutate: (value) => {
          if (value.standardEvents[0]) value.standardEvents[0].standardSlug = "missing-standard";
        },
      },
      {
        name: "missing-method",
        expected: "Snapshot CollectionMethod reference not found",
        mutate: (value) => {
          if (value.collectionMethodEvents[0]) {
            value.collectionMethodEvents[0].collectionMethodSlug = "missing-method";
          }
        },
      },
      {
        name: "missing-actor",
        expected: "Snapshot Actor reference not found",
        mutate: (value) => {
          if (value.actorDataCapabilities[0]) {
            value.actorDataCapabilities[0].actorSlug = "missing-actor";
          }
          if (value.actorCapabilityEvidence[0]) {
            value.actorCapabilityEvidence[0].actorSlug = "missing-actor";
          }
        },
      },
      {
        name: "missing-capability",
        expected: "Snapshot Actor capability reference not found",
        mutate: (value) => {
          if (value.actorCapabilityEvidence[0]) {
            value.actorCapabilityEvidence[0].capabilityKey = "missing-capability";
          }
        },
      },
      {
        name: "unsupported-version",
        expected: "Unsupported embodied data object schema version: 2",
        mutate: (value) => {
          if (value.datasets[0]) value.datasets[0].schemaVersion = 2;
        },
      },
      {
        name: "invalid-updated-at",
        expected: "Snapshot field updatedAt must be an ISO timestamp",
        mutate: (value) => {
          if (value.datasets[0]) value.datasets[0].updatedAt = "zzzz";
        },
      },
    ];
    const invalidDb = createDatabase(config);
    databases.push(invalidDb);
    await migrateToLatest(invalidDb, config);
    await seedDatabase(invalidDb);
    for (const corruption of corruptionCases) {
      const invalidSnapshot = structuredClone(snapshot) as ObjectSnapshotFixture;
      corruption.mutate(invalidSnapshot);
      const filename = `${corruption.name}.json`;
      await writeFile(join(root, filename), `${JSON.stringify(invalidSnapshot)}\n`, "utf8");
      await expect(restoreRepositorySnapshot(invalidDb, root, filename)).rejects.toThrow(
        corruption.expected,
      );
      expect(
        Number(
          (
            await invalidDb
              .selectFrom("datasets")
              .select(({ fn }) => fn.countAll<number>().as("count"))
              .executeTakeFirstOrThrow()
          ).count,
        ),
      ).toBe(0);
    }

    const targetDb = createDatabase(config);
    databases.push(targetDb);
    await migrateToLatest(targetDb, config);
    await seedDatabase(targetDb);
    const targetRepository = new Repository(targetDb);
    const targetObjectIds = {
      dataset: "00000000-0000-4000-8000-000000000101",
      standard: "00000000-0000-4000-8000-000000000102",
      method: "00000000-0000-4000-8000-000000000103",
      capability: "00000000-0000-4000-8000-000000000104",
    };
    const preexistingCreatedAt = "2020-01-01T00:00:00.000Z";
    const targetCapabilityActor = await targetDb
      .selectFrom("actors")
      .select("id")
      .where("slug", "=", capabilityActor.slug)
      .executeTakeFirstOrThrow();
    await targetDb
      .insertInto("datasets")
      .values({
        id: targetObjectIds.dataset,
        slug: datasetFixture.slug,
        profile_json: JSON.stringify(datasetFixture.profile),
        schema_version: 1,
        created_at: preexistingCreatedAt,
        updated_at: preexistingCreatedAt,
      })
      .execute();
    await targetDb
      .insertInto("standards")
      .values({
        id: targetObjectIds.standard,
        slug: standardFixture.slug,
        profile_json: JSON.stringify(standardFixture.profile),
        schema_version: 1,
        created_at: preexistingCreatedAt,
        updated_at: preexistingCreatedAt,
      })
      .execute();
    await targetDb
      .insertInto("collection_methods")
      .values({
        id: targetObjectIds.method,
        slug: methodFixture.slug,
        profile_json: JSON.stringify(methodFixture.profile),
        schema_version: 1,
        created_at: preexistingCreatedAt,
        updated_at: preexistingCreatedAt,
      })
      .execute();
    await targetDb
      .insertInto("actor_data_capabilities")
      .values({
        id: targetObjectIds.capability,
        actor_id: targetCapabilityActor.id,
        capability_key: capabilityFixture.capabilityKey,
        profile_json: JSON.stringify(capabilityFixture),
        schema_version: 1,
        created_at: preexistingCreatedAt,
        updated_at: preexistingCreatedAt,
      })
      .execute();
    const targetOpenai = (await targetRepository.listSources()).find(
      (source) => source.slug === "openai",
    );
    await targetRepository.updateSource(targetOpenai?.id ?? "", {
      last_collected_at: "2027-01-01T00:00:00.000Z",
      last_verified_at: "2027-01-01T00:00:00.000Z",
      success_count: 99,
      health_score: 99,
    });
    const localSummary = `A newer and deliberately more complete local summary. ${"local detail ".repeat(80)}`;
    await targetRepository.insertSignal(targetOpenai?.id ?? "", {
      externalId: "local-existing-signal",
      url: "https://openai.com/index/snapshot-test",
      title: "Snapshot persistence test signal with local detail",
      summary: localSummary,
      language: "en",
      publishedAt: "2026-07-11T08:00:00.000Z",
      category: "test",
      tags: ["local"],
      metrics: { platforms: ["local"] },
      rawMeta: { privateLocalDetail: true },
    });
    await targetRepository.insertSignal(targetOpenai?.id ?? "", {
      externalId: "local-repeat-observation",
      url: "https://openai.com/index/snapshot-test",
      title: "Snapshot persistence test signal with local detail",
      summary: localSummary,
      language: "en",
      publishedAt: "2026-07-11T08:00:00.000Z",
      category: "test",
      tags: ["local-repeat"],
      metrics: {},
      rawMeta: {},
    });
    const catalogSignal = await targetRepository.insertSignal(targetOpenai?.id ?? "", {
      externalId: "new-catalog-signal",
      url: "https://openai.com/index/new-catalog-signal",
      title: "New catalog signal added after the snapshot",
      summary: "Restore must merge rather than delete newer catalog evidence.",
      language: "en",
      publishedAt: "2026-07-12T08:00:00.000Z",
      category: "test",
      tags: ["catalog"],
      metrics: {},
      rawMeta: {},
    });
    const catalogEvent = (await targetRepository.listEvents())[0];
    expect(catalogEvent).toBeDefined();
    await targetRepository.attachSignal(
      catalogEvent?.id ?? "",
      catalogSignal?.id ?? "",
      "primary",
      100,
    );
    const restored = await restoreRepositorySnapshot(targetDb, root);
    expect(restored).toMatchObject({ restored: true, counts: first.counts });
    const restoredSignal = await targetDb
      .selectFrom("signals")
      .selectAll()
      .where("canonical_url", "=", "https://openai.com/index/snapshot-test")
      .executeTakeFirst();
    expect(restoredSignal?.canonical_url).toBe("https://openai.com/index/snapshot-test");
    expect(restoredSignal?.summary).toBe(localSummary);
    expect(restoredSignal?.raw_meta_json).toContain("privateLocalDetail");
    expect(
      await targetDb
        .selectFrom("sources")
        .select(["last_verified_at", "success_count", "health_score"])
        .where("id", "=", targetOpenai?.id ?? "")
        .executeTakeFirst(),
    ).toEqual({
      last_verified_at: "2027-01-01T00:00:00.000Z",
      success_count: 99,
      health_score: 99,
    });
    expect(
      await targetDb
        .selectFrom("signal_observations")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("signal_id", "=", restoredSignal?.id ?? "")
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: 2 });
    expect(
      await targetDb
        .selectFrom("signal_observations")
        .select(({ fn }) => fn.sum<number>("observation_count").as("count"))
        .where("signal_id", "=", restoredSignal?.id ?? "")
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: 4 });
    expect(
      await targetDb
        .selectFrom("signal_observation_occurrences")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("signal_id", "=", restoredSignal?.id ?? "")
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: 4 });
    expect(
      await targetDb
        .selectFrom("signal_triage")
        .select(["reason", "eventability_score"])
        .where("signal_id", "=", restoredSignal?.id ?? "")
        .executeTakeFirst(),
    ).toEqual({ reason: "snapshot-triage-fixture", eventability_score: 42 });
    expect(
      await targetDb
        .selectFrom("event_signals")
        .select("signal_id")
        .where("signal_id", "=", catalogSignal?.id ?? "")
        .executeTakeFirst(),
    ).toBeDefined();
    expect(
      await targetDb
        .selectFrom("source_checks")
        .select(["status", "final_url", "sample_json"])
        .where("id", "=", "snapshot-source-check")
        .executeTakeFirst(),
    ).toEqual({
      status: "healthy",
      final_url: "https://openai.com/feed.xml",
      sample_json: "{}",
    });
    expect(
      await targetDb
        .selectFrom("evaluation_runs")
        .select([
          "overall_score",
          "dimensions_json",
          "capability_snapshot_json",
          "evaluation_as_of",
          "gate_mode",
        ])
        .where("id", "=", "snapshot-evaluation-run")
        .executeTakeFirst(),
    ).toEqual({
      overall_score: 51,
      dimensions_json: JSON.stringify([{ slug: "coverage", score: 51, tokenCount: 42 }]),
      capability_snapshot_json: JSON.stringify([{ slug: "snapshot", status: "operational" }]),
      evaluation_as_of: "2026-07-11T07:58:00.000Z",
      gate_mode: "change",
    });
    await restoreRepositorySnapshot(targetDb, root);
    expect(
      Number(
        (
          await targetDb
            .selectFrom("evaluation_runs")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .executeTakeFirstOrThrow()
        ).count,
      ),
    ).toBe(1);
    expect(
      await targetDb
        .selectFrom("source_runs")
        .select(["status", "collected_count", "created_count"])
        .where("id", "=", runId)
        .executeTakeFirst(),
    ).toEqual({ status: "succeeded", collected_count: 10, created_count: 8 });
    expect(
      await targetDb
        .selectFrom("source_runs")
        .select("status")
        .where("id", "=", secondRunId)
        .executeTakeFirst(),
    ).toEqual({ status: "not_modified" });
    expect(await targetRepository.publicScoutInsights()).toHaveLength(1);

    const restoredProfileEvent = await targetDb
      .selectFrom("events")
      .select(["id", "content_scope"])
      .where("slug", "=", profiledEvent.slug)
      .executeTakeFirstOrThrow();
    expect(restoredProfileEvent.content_scope).toBe("embodied-data");
    expect(await targetRepository.getEventDataProfile(restoredProfileEvent.id)).toEqual(
      profiles.valid[0],
    );
    expect((await targetRepository.getDatasetBySlug(datasetFixture.slug))?.profile).toEqual(
      datasetFixture.profile,
    );
    expect(
      await targetDb
        .selectFrom("datasets")
        .select(["id", "created_at"])
        .where("slug", "=", datasetFixture.slug)
        .executeTakeFirstOrThrow(),
    ).toEqual({ id: targetObjectIds.dataset, created_at: preexistingCreatedAt });
    expect((await targetRepository.getStandardBySlug(standardFixture.slug))?.profile).toEqual(
      standardFixture.profile,
    );
    expect((await targetRepository.getCollectionMethodBySlug(methodFixture.slug))?.profile).toEqual(
      methodFixture.profile,
    );
    const restoredCapabilityActor = await targetDb
      .selectFrom("actors")
      .select("id")
      .where("slug", "=", capabilityActor.slug)
      .executeTakeFirstOrThrow();
    expect(await targetRepository.listActorDataCapabilities(restoredCapabilityActor.id)).toEqual([
      capabilityFixture,
    ]);
    expect(await targetDb.selectFrom("dataset_events").selectAll().execute()).toEqual([
      expect.objectContaining({
        dataset_id: targetObjectIds.dataset,
        event_id: restoredProfileEvent.id,
        relation_role: "release",
      }),
    ]);
    expect(await targetDb.selectFrom("standard_events").selectAll().execute()).toEqual([
      expect.objectContaining({
        standard_id: targetObjectIds.standard,
        event_id: restoredProfileEvent.id,
        relation_role: "publication",
      }),
    ]);
    expect(await targetDb.selectFrom("collection_method_events").selectAll().execute()).toEqual([
      expect.objectContaining({
        collection_method_id: targetObjectIds.method,
        event_id: restoredProfileEvent.id,
        relation_role: "demonstration",
      }),
    ]);
    expect(await targetDb.selectFrom("actor_capability_evidence").selectAll().execute()).toEqual([
      expect.objectContaining({
        capability_id: targetObjectIds.capability,
        event_id: restoredProfileEvent.id,
        evidence_role: "claim",
      }),
    ]);

    const legacyRoot = await mkdtemp(join(tmpdir(), "agent-pulse-legacy-snapshot-"));
    const legacySnapshot = structuredClone(snapshot);
    for (const collection of [
      legacySnapshot.sources,
      legacySnapshot.signals,
      legacySnapshot.events,
    ]) {
      for (const row of collection) delete row.contentScope;
    }
    delete legacySnapshot.eventDataProfiles;
    for (const key of [
      "datasets",
      "datasetEvents",
      "standards",
      "standardEvents",
      "collectionMethods",
      "collectionMethodEvents",
      "actorDataCapabilities",
      "actorCapabilityEvidence",
    ]) {
      delete legacySnapshot[key];
    }
    await writeFile(
      join(legacyRoot, "legacy.json"),
      `${JSON.stringify(legacySnapshot, null, 2)}\n`,
      "utf8",
    );
    const legacyDb = createDatabase(config);
    databases.push(legacyDb);
    await migrateToLatest(legacyDb, config);
    await seedDatabase(legacyDb);
    await restoreRepositorySnapshot(legacyDb, legacyRoot, "legacy.json");
    const legacyRepository = new Repository(legacyDb);
    const legacyProfileEvent = await legacyDb
      .selectFrom("events")
      .select(["id", "content_scope"])
      .where("slug", "=", profiledEvent.slug)
      .executeTakeFirstOrThrow();
    expect(legacyProfileEvent.content_scope).toBe("legacy-ai");
    expect(await legacyRepository.getEventDataProfile(legacyProfileEvent.id)).toBeUndefined();
    expect(await legacyRepository.listDatasets()).toEqual([]);
    expect(await legacyRepository.listStandards()).toEqual([]);
    expect(await legacyRepository.listCollectionMethods()).toEqual([]);
    const legacyCapabilityActor = await legacyDb
      .selectFrom("actors")
      .select("id")
      .where("slug", "=", capabilityActor.slug)
      .executeTakeFirstOrThrow();
    expect(await legacyRepository.listActorDataCapabilities(legacyCapabilityActor.id)).toEqual([]);
  }, 15_000);
});
